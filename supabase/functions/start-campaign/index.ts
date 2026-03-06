import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { logInfo, logError } from '../generate-world/logging.ts';
import { broadcastToChannel } from '../generate-world/broadcast.ts';

const anthropic = new Anthropic({
  apiKey: Deno.env.get('ANTHROPIC_API_KEY')!
});

const SESSION_GEN_MAX_TOKENS = 4096;
const SESSION_GEN_MODEL = 'claude-haiku-4-5-20251001';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

const SYSTEM_PROMPT = `You are a Game Master for a tabletop RPG campaign. Given a world description and a list of player characters, generate the campaign's opening scene.

Return ONLY valid JSON — no markdown, no explanation, no code fences:
{
  "opening_situation": "<3-5 sentence narrative paragraph describing where the party finds themselves: setting, atmosphere, what is immediately happening around them>",
  "starting_hooks": ["<hook 1>", "<hook 2>", "<hook 3>"]
}

Rules:
- opening_situation must be immersive, specific to this world, and written in second person ("You find yourselves…"). They can be together in the same location or split up.
- starting_hooks must be concrete, actionable choices or mysteries the party faces immediately. Needs to be related to the opening_situation and grounded in the world and characters and their background.
- Do not repeat information already in opening_situation verbatim
- Match the tone and genre of the world exactly
- Detect the language used in the world description and write opening_situation and starting_hooks entirely in that language`;

Deno.serve(async (req: Request) => {
  const requestStartedAt = Date.now();
  const requestId = crypto.randomUUID();

  logInfo('start_campaign.request_received', { requestId, method: req.method });

  const webhookSecret = Deno.env.get('START_CAMPAIGN_WEBHOOK_SECRET');
  const authHeader = req.headers.get('authorization');
  if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
    logInfo('start_campaign.auth_failed', { requestId });
    return new Response('Unauthorized', { status: 401 });
  }

  let body: { campaign_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { campaign_id } = body;
  if (!campaign_id) {
    logInfo('start_campaign.payload_invalid', { requestId, campaign_id });
    return new Response('Missing required fields', { status: 400 });
  }

  logInfo('start_campaign.payload_validated', { requestId, campaign_id });

  try {
    // 1. Fetch campaign to get world_id
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('world_id')
      .eq('id', campaign_id)
      .single();

    if (campaignError || !campaign) {
      throw new Error(`campaign not found: ${campaign_id}`);
    }

    // 2. Fetch world content
    const { data: world, error: worldError } = await supabase
      .from('worlds')
      .select('name, world_content')
      .eq('id', campaign.world_id)
      .single();

    if (worldError || !world?.world_content) {
      throw new Error(`world content not found for world ${campaign.world_id}`);
    }
    logInfo('start_campaign.world_fetched', {
      requestId,
      campaign_id,
      worldName: world.name
    });

    // 2. Fetch players
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('id, character_name, character_class, character_backstory, username')
      .eq('campaign_id', campaign_id);

    if (playersError || !players) {
      throw new Error(`failed to fetch players for campaign ${campaign_id}`);
    }
    logInfo('start_campaign.players_fetched', {
      requestId,
      campaign_id,
      playerCount: players.length
    });

    // 3. Idempotency check — return early if already started
    const { data: existingCampaign } = await supabase
      .from('campaigns')
      .select('opening_situation')
      .eq('id', campaign_id)
      .single();

    if (existingCampaign?.opening_situation) {
      logInfo('start_campaign.already_started', { requestId, campaign_id });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 4. Build user prompt — world content and player data are in the user message,
    //    not the system prompt, to prevent prompt injection from user-controlled content.
    const playerList = players
      .map((p) => {
        const backstory = p.character_backstory
          ? ` Backstory: ${p.character_backstory}`
          : '';
        return `- ${p.character_name ?? p.username} (${p.character_class ?? 'unknown class'})${backstory}`;
      })
      .join('\n');

    const userPrompt = `World: ${world.name}

${world.world_content}

Party members:
${playerList}`;

    // 5. Call Claude
    logInfo('start_campaign.ai_started', {
      requestId,
      campaign_id,
      model: SESSION_GEN_MODEL
    });
    const aiStartedAt = Date.now();

    const message = await anthropic.messages.create({
      model: SESSION_GEN_MODEL,
      max_tokens: SESSION_GEN_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    logInfo('start_campaign.ai_finished', {
      requestId,
      campaign_id,
      durationMs: Date.now() - aiStartedAt,
      outputLength: text.length
    });

    const jsonText = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
    const parsed = JSON.parse(jsonText) as {
      opening_situation: string;
      starting_hooks: string[];
    };

    // 6. Save to campaign
    const { error: saveError } = await supabase
      .from('campaigns')
      .update({
        opening_situation: parsed.opening_situation,
        starting_hooks: parsed.starting_hooks
      })
      .eq('id', campaign_id);

    if (saveError) {
      throw new Error(`failed to save opening content: ${saveError.message}`);
    }
    logInfo('start_campaign.opening_content_saved', { requestId, campaign_id });

    // 7. Broadcast game:started
    await broadcastToChannel(
      supabaseUrl,
      serviceRoleKey,
      `campaign:${campaign_id}`,
      'game:started',
      {
        opening_situation: parsed.opening_situation,
        starting_hooks: parsed.starting_hooks
      }
    );
    logInfo('start_campaign.game_started_broadcast_sent', { requestId, campaign_id });

    // 8. Fire-and-forget cover image generation
    const imageSecret = Deno.env.get('GENERATE_IMAGE_WEBHOOK_SECRET');
    const imageHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (imageSecret) imageHeaders.authorization = `Bearer ${imageSecret}`;

    const imagePromise = fetch(`${supabaseUrl}/functions/v1/generate-image`, {
      method: 'POST',
      headers: imageHeaders,
      body: JSON.stringify({
        entity_type: 'campaign',
        entity_id: campaign_id,
        image_type: 'cover'
      })
    })
      .then(async (res) => {
        if (!res.ok) {
          logError(
            'start_campaign.image_failed',
            { requestId, campaign_id, status: res.status },
            new Error(`generate-image responded with ${res.status}`)
          );
        } else {
          logInfo('start_campaign.image_triggered', { requestId, campaign_id });
        }
      })
      .catch((err) => {
        logError('start_campaign.image_fetch_failed', { requestId, campaign_id }, err);
      });

    // @ts-ignore — EdgeRuntime is available in Supabase edge function environments
    EdgeRuntime.waitUntil(imagePromise);

    logInfo('start_campaign.completed', {
      requestId,
      campaign_id,
      durationMs: Date.now() - requestStartedAt
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    logError(
      'start_campaign.failed',
      { requestId, campaign_id, durationMs: Date.now() - requestStartedAt },
      err
    );
    return new Response('Internal error', { status: 500 });
  }
});
