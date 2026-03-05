import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'
import { broadcastPlayerUpdate } from '@/lib/realtime-broadcast'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const authClient = await createAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const b = body as Record<string, unknown>

  if (typeof b.is_ready !== 'boolean') {
    return NextResponse.json({ error: 'Missing or invalid field: is_ready must be boolean' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  // Fetch current player row to validate state
  const { data: current, error: fetchError } = await supabase
    .from('players')
    .select('id, character_name, character_class')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .single()

  if (fetchError) {
    if (fetchError.code === 'PGRST116') {
      return NextResponse.json({ error: 'Player not found in this campaign' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  if (!current) {
    return NextResponse.json({ error: 'Player not found in this campaign' }, { status: 404 })
  }

  // Can't mark ready without a character
  if (b.is_ready && (!current.character_name || !current.character_class)) {
    return NextResponse.json(
      { error: 'Character must be saved before marking ready' },
      { status: 422 }
    )
  }

  const { data: player, error: updateError } = await supabase
    .from('players')
    .update({ is_ready: b.is_ready })
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (updateError || !player) {
    return NextResponse.json({ error: 'Failed to update ready status' }, { status: 500 })
  }

  // Fire-and-forget — broadcast failure must not break the response
  void broadcastPlayerUpdate(campaignId, player)

  return NextResponse.json({ player }, { status: 200 })
}
