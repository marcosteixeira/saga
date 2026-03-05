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
  // stub — implementation added in Task 5
  void anthropic
  void campaignId
  void worldId
  void players
}
