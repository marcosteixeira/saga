import { NextRequest, NextResponse } from 'next/server'
import { createAuthServerClient, createServerSupabaseClient } from '@/lib/supabase/server'
import type { TurnState } from '@/types'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = await createAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await params
  const supabase = createServerSupabaseClient()
  const body = await request.json().catch(() => ({}))
  const { mode, turn_order } = body

  if (!['free', 'sequential'].includes(mode)) {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  }

  // Fetch campaign to verify host
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, host_user_id, turn_mode, turn_state')
    .eq('id', campaignId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.host_user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let newTurnState: TurnState | Record<string, never>
  let newTurnMode: 'free' | 'sequential'

  if (mode === 'sequential') {
    let order: string[] = turn_order ?? []

    if (order.length === 0) {
      // Default: active players sorted by joined_at
      const { data: players } = await supabase
        .from('players')
        .select('id, joined_at')
        .eq('campaign_id', campaignId)
        .in('status', ['active'])
        .order('joined_at', { ascending: true })
      order = (players ?? [])
        .sort((a: { joined_at: string }, b: { joined_at: string }) =>
          a.joined_at < b.joined_at ? -1 : a.joined_at > b.joined_at ? 1 : 0
        )
        .map((p: { id: string }) => p.id)
    }

    newTurnState = { order, current_index: 0, round: 1 }
    newTurnMode = 'sequential'
  } else {
    newTurnState = {}
    newTurnMode = 'free'
  }

  await supabase
    .from('campaigns')
    .update({ turn_mode: newTurnMode, turn_state: newTurnState })
    .eq('id', campaignId)

  // Broadcast mode change
  await supabase.channel(`campaign:${campaignId}:turn`).send({
    type: 'broadcast',
    event: 'turn_mode_changed',
    payload: { turn_mode: newTurnMode, turn_state: newTurnState },
  })

  return NextResponse.json({ turn_mode: newTurnMode, turn_state: newTurnState })
}
