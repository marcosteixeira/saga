import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'

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

  return NextResponse.json({ player }, { status: 200 })
}
