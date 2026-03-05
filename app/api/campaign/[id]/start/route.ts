import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'
import { broadcastCampaignEvent } from '@/lib/realtime-broadcast'
import { anthropic } from '@/lib/anthropic'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const authClient = await createAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient()

  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, host_user_id, status, world_id')
    .eq('id', campaignId)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.host_user_id !== user.id) {
    return NextResponse.json({ error: 'Only the host can start the campaign' }, { status: 403 })
  }

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, is_ready, character_name, character_class, character_backstory, username')
    .eq('campaign_id', campaignId)

  if (playersError) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const notReady = (players ?? []).filter((p) => !p.is_ready)
  if (notReady.length > 0) {
    return NextResponse.json({ error: 'Players not ready' }, { status: 400 })
  }

  const { error: updateError } = await supabase
    .from('campaigns')
    .update({ status: 'active' })
    .eq('id', campaignId)

  if (updateError) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  await broadcastCampaignEvent(campaignId, 'game:starting', {})

  generateSessionContent(campaignId, campaign.world_id, players ?? []).catch((err) => {
    console.error('[start-campaign] async generation failed:', err)
  })

  return NextResponse.json({ ok: true }, { status: 200 })
}

export async function generateSessionContent(
  campaignId: string,
  worldId: string,
  players: Array<{
    id: string
    character_name: string | null
    character_class: string | null
    character_backstory: string | null
    username: string
  }>
): Promise<void> {
  const supabase = createServerSupabaseClient()

  const { data: world, error: worldError } = await supabase
    .from('worlds')
    .select('name, world_content')
    .eq('id', worldId)
    .single()

  if (worldError || !world?.world_content) {
    throw new Error(`[start-campaign] world content not found for world ${worldId}`)
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      campaign_id: campaignId,
      session_number: 1,
      present_player_ids: players.map((p) => p.id),
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    throw new Error(`[start-campaign] failed to create session: ${sessionError?.message}`)
  }

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

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = message.content.find((b: { type: string; text?: string }) => b.type === 'text')?.text ?? ''
  const parsed = JSON.parse(text) as {
    opening_situation: string
    starting_hooks: string[]
  }

  await supabase
    .from('sessions')
    .update({
      opening_situation: parsed.opening_situation,
      starting_hooks: parsed.starting_hooks,
    })
    .eq('id', session.id)

  await broadcastCampaignEvent(campaignId, 'game:started', {
    session_id: session.id,
    opening_situation: parsed.opening_situation,
    starting_hooks: parsed.starting_hooks,
  })

  triggerSceneImageGeneration(campaignId, session.id, world.name, world.world_content, playerList)
    .catch((err) => console.error('[start-campaign] scene image generation failed:', err))
}

async function triggerSceneImageGeneration(
  _campaignId: string,
  _sessionId: string,
  _worldName: string,
  _worldContent: string,
  _playerList: string,
): Promise<void> {
  // stub — implementation added in Task 6
}
