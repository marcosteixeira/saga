import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const body = await req.json()
  const { name, host_username, world_description, system_description } = body

  if (!name || !host_username || !world_description) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const host_session_token = crypto.randomUUID()

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      name,
      host_username,
      world_description,
      system_description: system_description || null,
      host_session_token,
      status: 'lobby',
    })
    .select('id, host_session_token')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id, host_session_token: data.host_session_token }, { status: 201 })
}
