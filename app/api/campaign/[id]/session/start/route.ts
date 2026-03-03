import { NextRequest, NextResponse } from 'next/server'
import { createAuthServerClient, createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = await createAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await params
  const supabase = createServerSupabaseClient()

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, status, host_user_id')
    .eq('id', campaignId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (campaign.host_user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!['lobby', 'paused'].includes(campaign.status)) {
    return NextResponse.json({ error: 'Campaign already active or ended' }, { status: 400 })
  }

  const { data: existingSessions } = await supabase
    .from('sessions')
    .select('id')
    .eq('campaign_id', campaignId)
  const sessionNumber = (existingSessions?.length ?? 0) + 1

  const { data: activePlayers } = await supabase
    .from('players')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('status', 'active')
  const presentPlayerIds = (activePlayers ?? []).map((p: { id: string }) => p.id)

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({ campaign_id: campaignId, session_number: sessionNumber, present_player_ids: presentPlayerIds })
    .select()
    .single()
  if (sessionError) return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })

  await supabase
    .from('campaigns')
    .update({ status: 'active', current_session_id: session.id })
    .eq('id', campaignId)

  return NextResponse.json({ session }, { status: 200 })
}
