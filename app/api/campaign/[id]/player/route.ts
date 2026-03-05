import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'
import { broadcastPlayerUpdate, broadcastPlayerJoin } from '@/lib/realtime-broadcast'

export async function POST(
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
  const username = typeof b.username === 'string' ? b.username.trim() : null

  if (!username) {
    return NextResponse.json({ error: 'Missing required field: username' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  // Verify campaign exists and is in lobby status
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, status')
    .eq('id', campaignId)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.status !== 'lobby') {
    return NextResponse.json({ error: 'Campaign is not in lobby' }, { status: 409 })
  }

  // Check if the player already exists
  const { data: existingPlayer, error: existingError } = await supabase
    .from('players')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .single()

  if (existingPlayer) {
    return NextResponse.json({ player: existingPlayer }, { status: 200 })
  }

  // existingError with code PGRST116 means not found — any other error is unexpected
  if (existingError && existingError.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  // Insert new player
  const { data: player, error: insertError } = await supabase
    .from('players')
    .insert({ campaign_id: campaignId, user_id: user.id, username })
    .select()
    .single()

  if (insertError || !player) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  void broadcastPlayerJoin(campaignId, player)
  return NextResponse.json({ player }, { status: 201 })
}

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

  if (typeof b.character_name !== 'string' || !b.character_name.trim()) {
    return NextResponse.json({ error: 'Missing required field: character_name' }, { status: 400 })
  }
  if (typeof b.character_class !== 'string' || !b.character_class.trim()) {
    return NextResponse.json({ error: 'Missing required field: character_class' }, { status: 400 })
  }

  const character_name = b.character_name.trim()
  const character_class = b.character_class.trim()
  const character_backstory = typeof b.character_backstory === 'string' && b.character_backstory.trim()
    ? b.character_backstory.trim()
    : null

  const supabase = createServerSupabaseClient()

  const { data: player, error } = await supabase
    .from('players')
    .update({ character_name, character_class, character_backstory, is_ready: false })
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Player not found in this campaign' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  if (!player) {
    return NextResponse.json({ error: 'Player not found in this campaign' }, { status: 404 })
  }

  // Fire-and-forget — broadcast failure must not break the response
  void broadcastPlayerUpdate(campaignId, player)

  return NextResponse.json({ player }, { status: 200 })
}
