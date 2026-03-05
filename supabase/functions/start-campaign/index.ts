import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import Anthropic from "npm:@anthropic-ai/sdk"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { logInfo, logError } from "../generate-world/logging.ts"
import { broadcastToChannel } from "../generate-world/broadcast.ts"

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY")!,
})

const SESSION_GEN_MAX_TOKENS = 4096
const SESSION_GEN_MODEL = "claude-haiku-4-5-20251001"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const supabase = createClient(supabaseUrl, serviceRoleKey)

const SYSTEM_PROMPT = `You are a Game Master for a tabletop RPG campaign. Given a world description and a list of player characters, generate the opening scene for Session 1.

Return ONLY valid JSON — no markdown, no explanation, no code fences:
{
  "opening_situation": "<3-5 sentence narrative paragraph describing where the party finds themselves: setting, atmosphere, what is immediately happening around them>",
  "starting_hooks": ["<hook 1>", "<hook 2>", "<hook 3>"]
}

Rules:
- opening_situation must be immersive, specific to this world, and written in second person ("You find yourselves…")
- starting_hooks must be concrete, actionable choices or mysteries the party faces immediately
- Do not repeat information already in opening_situation verbatim
- Match the tone and genre of the world exactly`

Deno.serve(async (req: Request) => {
  const requestStartedAt = Date.now()
  const requestId = crypto.randomUUID()

  logInfo("start_campaign.request_received", { requestId, method: req.method })

  const webhookSecret = Deno.env.get("START_CAMPAIGN_WEBHOOK_SECRET")
  const authHeader = req.headers.get("authorization")
  if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
    logInfo("start_campaign.auth_failed", { requestId })
    return new Response("Unauthorized", { status: 401 })
  }

  let body: { campaign_id?: string; world_id?: string }
  try {
    body = await req.json()
  } catch {
    return new Response("Invalid JSON", { status: 400 })
  }

  const { campaign_id, world_id } = body
  if (!campaign_id || !world_id) {
    logInfo("start_campaign.payload_invalid", { requestId, campaign_id, world_id })
    return new Response("Missing required fields", { status: 400 })
  }

  logInfo("start_campaign.payload_validated", { requestId, campaign_id, world_id })

  try {
    // 1. Fetch world content
    const { data: world, error: worldError } = await supabase
      .from("worlds")
      .select("name, world_content")
      .eq("id", world_id)
      .single()

    if (worldError || !world?.world_content) {
      throw new Error(`world content not found for world ${world_id}`)
    }
    logInfo("start_campaign.world_fetched", { requestId, campaign_id, worldName: world.name })

    // 2. Fetch players
    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("id, character_name, character_class, character_backstory, username")
      .eq("campaign_id", campaign_id)

    if (playersError || !players) {
      throw new Error(`failed to fetch players for campaign ${campaign_id}`)
    }
    logInfo("start_campaign.players_fetched", { requestId, campaign_id, playerCount: players.length })

    // 3. Create session row
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .insert({
        campaign_id,
        session_number: 1,
        present_player_ids: players.map((p) => p.id),
      })
      .select("id")
      .single()

    if (sessionError || !session) {
      throw new Error(`failed to create session: ${sessionError?.message}`)
    }
    logInfo("start_campaign.session_created", { requestId, campaign_id, sessionId: session.id })

    // 4. Build user prompt — world content and player data are in the user message,
    //    not the system prompt, to prevent prompt injection from user-controlled content.
    const playerList = players
      .map((p) => {
        const backstory = p.character_backstory ? ` Backstory: ${p.character_backstory}` : ""
        return `- ${p.character_name ?? p.username} (${p.character_class ?? "unknown class"})${backstory}`
      })
      .join("\n")

    const userPrompt = `World: ${world.name}

${world.world_content}

Party members:
${playerList}`

    // 5. Call Claude
    logInfo("start_campaign.ai_started", { requestId, campaign_id, model: SESSION_GEN_MODEL })
    const aiStartedAt = Date.now()

    const message = await anthropic.messages.create({
      model: SESSION_GEN_MODEL,
      max_tokens: SESSION_GEN_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    })

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("")

    logInfo("start_campaign.ai_finished", {
      requestId,
      campaign_id,
      durationMs: Date.now() - aiStartedAt,
      outputLength: text.length,
    })

    const parsed = JSON.parse(text) as {
      opening_situation: string
      starting_hooks: string[]
    }

    // 6. Save to session
    const { error: saveError } = await supabase
      .from("sessions")
      .update({
        opening_situation: parsed.opening_situation,
        starting_hooks: parsed.starting_hooks,
      })
      .eq("id", session.id)

    if (saveError) {
      throw new Error(`failed to save session content: ${saveError.message}`)
    }
    logInfo("start_campaign.session_content_saved", { requestId, campaign_id, sessionId: session.id })

    // 7. Broadcast game:started
    await broadcastToChannel(supabaseUrl, serviceRoleKey, `campaign:${campaign_id}`, "game:started", {
      session_id: session.id,
      opening_situation: parsed.opening_situation,
      starting_hooks: parsed.starting_hooks,
    })
    logInfo("start_campaign.game_started_broadcast_sent", { requestId, campaign_id })

    // 8. Fire-and-forget scene image generation
    const sceneSecret = Deno.env.get("GENERATE_SCENE_IMAGE_WEBHOOK_SECRET")
    const sceneHeaders: Record<string, string> = { "Content-Type": "application/json" }
    if (sceneSecret) sceneHeaders.authorization = `Bearer ${sceneSecret}`

    const imagePromise = fetch(`${supabaseUrl}/functions/v1/generate-scene-image`, {
      method: "POST",
      headers: sceneHeaders,
      body: JSON.stringify({
        session_id: session.id,
        campaign_id,
        world_name: world.name,
        world_content: world.world_content,
        player_list: playerList,
      }),
    }).then(async (res) => {
      if (!res.ok) {
        logError(
          "start_campaign.scene_image_failed",
          { requestId, campaign_id, sessionId: session.id, status: res.status },
          new Error(`generate-scene-image responded with ${res.status}`),
        )
      } else {
        logInfo("start_campaign.scene_image_triggered", { requestId, campaign_id, sessionId: session.id })
      }
    }).catch((err) => {
      logError("start_campaign.scene_image_fetch_failed", { requestId, campaign_id }, err)
    })

    // @ts-ignore — EdgeRuntime is available in Supabase edge function environments
    EdgeRuntime.waitUntil(imagePromise)

    logInfo("start_campaign.completed", {
      requestId,
      campaign_id,
      sessionId: session.id,
      durationMs: Date.now() - requestStartedAt,
    })

    return new Response(JSON.stringify({ ok: true, session_id: session.id }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (err) {
    logError(
      "start_campaign.failed",
      { requestId, campaign_id, durationMs: Date.now() - requestStartedAt },
      err,
    )
    return new Response("Internal error", { status: 500 })
  }
})
