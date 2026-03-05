const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

type Player = {
  id: string
  character_name: string | null
  character_class: string | null
  character_backstory: string | null
  username: string
}

async function broadcastCampaignEvent(
  supabaseUrl: string,
  serviceRoleKey: string,
  campaignId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        messages: [{ topic: `campaign:${campaignId}`, event, payload }],
      }),
    })
  } catch {
    // fire-and-forget
  }
}

Deno.serve(async (req: Request) => {
  const webhookSecret = Deno.env.get('START_CAMPAIGN_WEBHOOK_SECRET')
  const authHeader = req.headers.get('authorization')
  if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: { campaign_id?: string; world_id?: string; players?: Player[] }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const { campaign_id, world_id, players } = body
  if (!campaign_id || !world_id || !players) {
    return new Response('Missing required fields', { status: 400 })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const { createClient } = await import('jsr:@supabase/supabase-js@2')
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // 1. Fetch world content
    const { data: world, error: worldError } = await supabase
      .from('worlds')
      .select('name, world_content')
      .eq('id', world_id)
      .single()

    if (worldError || !world?.world_content) {
      throw new Error(`world content not found for world ${world_id}`)
    }

    // 2. Create session row
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        campaign_id,
        session_number: 1,
        present_player_ids: players.map((p) => p.id),
      })
      .select('id')
      .single()

    if (sessionError || !session) {
      throw new Error(`failed to create session: ${sessionError?.message}`)
    }

    // 3. Build prompt
    const playerList = players
      .map((p) => {
        const backstory = p.character_backstory ? ` Backstory: ${p.character_backstory}` : ''
        return `- ${p.character_name ?? p.username} (${p.character_class ?? 'unknown class'})${backstory}`
      })
      .join('\n')

    const userPrompt = `World: ${world.name}

${world.world_content}

Party members:
${playerList}

Generate the opening scene for this adventure. Return valid JSON only — no markdown, no explanation:
{
  "opening_situation": "<3-5 sentence narrative paragraph describing where the party finds themselves: setting, atmosphere, what is immediately happening>",
  "starting_hooks": ["<hook 1>", "<hook 2>", "<hook 3>"]
}`

    // 4. Call Claude
    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!anthropicRes.ok) {
      throw new Error(`Anthropic API error: ${anthropicRes.status}`)
    }

    const anthropicData = await anthropicRes.json()
    const text = anthropicData.content?.find((b: { type: string }) => b.type === 'text')?.text ?? ''
    const parsed = JSON.parse(text) as {
      opening_situation: string
      starting_hooks: string[]
    }

    // 5. Save to session
    const { error: saveError } = await supabase
      .from('sessions')
      .update({
        opening_situation: parsed.opening_situation,
        starting_hooks: parsed.starting_hooks,
      })
      .eq('id', session.id)

    if (saveError) {
      throw new Error(`failed to save session content: ${saveError.message}`)
    }

    // 6. Broadcast game:started
    await broadcastCampaignEvent(supabaseUrl, serviceRoleKey, campaign_id, 'game:started', {
      session_id: session.id,
      opening_situation: parsed.opening_situation,
      starting_hooks: parsed.starting_hooks,
    })

    // 7. Fire-and-forget scene image generation
    const sceneImageUrl = `${supabaseUrl}/functions/v1/generate-scene-image`
    const sceneSecret = Deno.env.get('GENERATE_SCENE_IMAGE_WEBHOOK_SECRET')
    const sceneHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
    if (sceneSecret) sceneHeaders.authorization = `Bearer ${sceneSecret}`

    fetch(sceneImageUrl, {
      method: 'POST',
      headers: sceneHeaders,
      body: JSON.stringify({
        session_id: session.id,
        campaign_id,
        world_name: world.name,
        world_content: world.world_content,
        player_list: playerList,
      }),
    }).then(async (res) => {
      if (!res.ok) console.error(`[start-campaign] generate-scene-image failed HTTP ${res.status}`)
    }).catch((err) => console.error('[start-campaign] generate-scene-image fetch failed:', err))

    return new Response(JSON.stringify({ ok: true, session_id: session.id }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[start-campaign] failed', err)
    return new Response('Internal error', { status: 500 })
  }
})
