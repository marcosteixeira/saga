import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const authClient = await createAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, world_id, system_description } = body
  const host_username: string =
    body.host_username?.trim() ||
    user.user_metadata?.display_name ||
    user.email ||
    'Unknown Host'

  if (!name || !world_id) {
    return NextResponse.json(
      { error: 'Missing required fields: name, world_id' },
      { status: 400 }
    )
  }

  const supabase = createServerSupabaseClient()

  // Verify the world belongs to this user and exists
  const { data: world, error: worldError } = await supabase
    .from('worlds')
    .select('id, status')
    .eq('id', world_id)
    .eq('user_id', user.id)
    .single()

  if (worldError || !world) {
    return NextResponse.json({ error: 'World not found' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      name,
      host_username,
      host_user_id: user.id,
      world_id,
      system_description: system_description || null,
      status: 'lobby',
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }

  // Create the host player row so they can save their character in the lobby
  await supabase.from('players').insert({
    campaign_id: data.id,
    user_id: user.id,
    username: host_username,
    is_host: true,
  })

  return NextResponse.json({ id: data.id }, { status: 201 })
}
