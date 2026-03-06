import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'
import { broadcastCampaignEvent } from '@/lib/realtime-broadcast'

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
    .select('id, host_user_id, status')
    .eq('id', campaignId)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.host_user_id !== user.id) {
    return NextResponse.json({ error: 'Only the host can start the campaign' }, { status: 403 })
  }

  if (campaign.status !== 'lobby') {
    return NextResponse.json({ error: 'Campaign already started' }, { status: 409 })
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
    .eq('status', 'lobby')
    .select('id')
    .single()

  if (updateError) {
    if (updateError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Campaign already started' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  await broadcastCampaignEvent(campaignId, 'game:starting', {})

  // Fire-and-forget: campaign cover image
  const imageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-image`
  const imageHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.GENERATE_IMAGE_WEBHOOK_SECRET) {
    imageHeaders.authorization = `Bearer ${process.env.GENERATE_IMAGE_WEBHOOK_SECRET}`
  }
  fetch(imageUrl, {
    method: 'POST',
    headers: imageHeaders,
    body: JSON.stringify({
      entity_type: 'campaign',
      entity_id: campaignId,
      image_type: 'cover',
    }),
  }).then((res) => {
    if (!res.ok) console.error(`[start] cover image trigger failed HTTP ${res.status}`)
  }).catch((err) => console.error('[start] cover image trigger failed:', err))

  return NextResponse.json({ ok: true }, { status: 200 })
}
