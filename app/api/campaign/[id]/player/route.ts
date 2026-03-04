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

  const body = await req.json()

  if (typeof body.character_name !== 'string' || !body.character_name.trim()) {
    return NextResponse.json({ error: 'Missing required field: character_name' }, { status: 400 })
  }
  if (typeof body.character_class !== 'string' || !body.character_class.trim()) {
    return NextResponse.json({ error: 'Missing required field: character_class' }, { status: 400 })
  }

  const character_name = body.character_name.trim()
  const character_class = body.character_class.trim()
  const character_backstory = typeof body.character_backstory === 'string' && body.character_backstory.trim()
    ? body.character_backstory.trim()
    : null

  const supabase = createServerSupabaseClient()

  const { data: player, error } = await supabase
    .from('players')
    .update({ character_name, character_class, character_backstory, is_ready: false })
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error || !player) {
    return NextResponse.json({ error: 'Player not found in this campaign' }, { status: 404 })
  }

  return NextResponse.json({ player }, { status: 200 })
}
