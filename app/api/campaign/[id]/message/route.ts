import { NextRequest, NextResponse } from 'next/server'
import { createAuthServerClient, createServerSupabaseClient } from '@/lib/supabase/server'

const VALID_TYPES = ['action', 'ooc'] as const

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = await createAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await params
  const supabase = createServerSupabaseClient()
  const body = await request.json().catch(() => ({}))
  const { content, type } = body

  // 1. Validate campaign
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, status, current_session_id')
    .eq('id', campaignId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.status !== 'active') return NextResponse.json({ error: 'Campaign is not active' }, { status: 400 })

  // 2. Find player
  const { data: player } = await supabase
    .from('players')
    .select('id, status')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .single()
  if (!player) return NextResponse.json({ error: 'You are not in this campaign' }, { status: 403 })
  if (!['active', 'absent'].includes(player.status)) {
    return NextResponse.json({ error: 'Your character cannot act' }, { status: 400 })
  }

  // 3. Validate input
  if (!content?.trim()) return NextResponse.json({ error: 'Content is required' }, { status: 400 })
  if (!VALID_TYPES.includes(type)) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  // 4. Check for duplicate submission this turn
  // "This turn" = since the last narration message in this session
  const { data: lastNarration } = await supabase
    .from('messages')
    .select('created_at')
    .eq('campaign_id', campaignId)
    .eq('session_id', campaign.current_session_id)
    .eq('type', 'narration')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  const sinceTime = lastNarration?.created_at ?? new Date(0).toISOString()

  const { data: existingAction } = await supabase
    .from('messages')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('session_id', campaign.current_session_id)
    .eq('player_id', player.id)
    .eq('type', 'action')
    .gt('created_at', sinceTime)
  if (existingAction && existingAction.length > 0) {
    return NextResponse.json({ error: 'Already submitted this turn' }, { status: 409 })
  }

  // 5. Save message
  const { data: message, error: insertError } = await supabase
    .from('messages')
    .insert({
      campaign_id: campaignId,
      session_id: campaign.current_session_id,
      player_id: player.id,
      content: content.trim(),
      type,
    })
    .select()
    .single()
  if (insertError) return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })

  // 6. Broadcast via Realtime
  await supabase.channel(`campaign:${campaignId}:messages`).send({
    type: 'broadcast',
    event: 'new_message',
    payload: message,
  })

  return NextResponse.json({ message }, { status: 201 })
}
