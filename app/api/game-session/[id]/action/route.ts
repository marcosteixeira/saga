// app/api/game-session/[id]/action/route.ts
import { NextResponse, after } from 'next/server'
import { createAuthServerClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { broadcastGameEvent } from '@/lib/realtime-broadcast'
import { ROUND_DEBOUNCE_SECONDS } from '@/lib/game-session/config'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const authClient = await createAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient()

  // Verify player membership
  const { data: player } = await supabase
    .from('players')
    .select('id, character_name, username')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!player) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Reject actions while a round is actively running — they'll need to wait for the next window
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('round_in_progress')
    .eq('id', campaignId)
    .single()

  if (campaign?.round_in_progress) {
    return NextResponse.json({ reason: 'round_in_progress' }, { status: 409 })
  }

  let body: { id?: string; content?: string; timestamp?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.id || !body.content) {
    return NextResponse.json({ error: 'Missing id or content' }, { status: 400 })
  }

  // Save action
  const { error: insertError } = await supabase
    .from('messages')
    .insert({
      campaign_id: campaignId,
      player_id: player.id,
      content: body.content,
      type: 'action' as const,
      client_id: body.id,
      processed: false,
    })

  if (insertError) {
    // Duplicate client_id (reconnect replay) — treat as success
    if (insertError.code === '23505') {
      return NextResponse.json({ ok: true }, { status: 200 })
    }
    return NextResponse.json({ error: 'Failed to save action' }, { status: 500 })
  }

  // Push next_round_at forward — self-cancelling debounce.
  // Any worker that fires before this timestamp will skip.
  const nextRoundAt = new Date(Date.now() + ROUND_DEBOUNCE_SECONDS * 1000).toISOString()
  await supabase
    .from('campaigns')
    .update({ next_round_at: nextRoundAt })
    .eq('id', campaignId)

  // Broadcast action to all game clients
  const playerName = (player.character_name ?? player.username ?? 'Unknown') as string
  await broadcastGameEvent(campaignId, 'action', {
    id: body.id,
    campaign_id: campaignId,
    player_id: player.id,
    content: body.content,
    type: 'action',
    client_id: body.id,
    processed: false,
    created_at: new Date().toISOString(),
    playerName,
  })

  // Schedule round worker: fires after debounce window.
  // Checks next_round_at on arrival — if extended by a later action, skips.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, ROUND_DEBOUNCE_SECONDS * 1000))
    await fetch(`${appUrl}/api/game-session/${campaignId}/round`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? '',
      },
    })
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}
