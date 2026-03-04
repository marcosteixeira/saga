import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const authClient = await createAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, world_description, system_description } = body
  const host_username: string =
    body.host_username?.trim() ||
    user.user_metadata?.display_name ||
    user.email ||
    'Unknown Host'

  if (!name || !world_description) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      name,
      host_username,
      host_user_id: user.id,
      world_description,
      system_description: system_description || null,
      status: 'generating',
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }

  const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-world`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.GENERATE_WORLD_WEBHOOK_SECRET) {
    headers.authorization = `Bearer ${process.env.GENERATE_WORLD_WEBHOOK_SECRET}`
  }

  // Fire-and-forget: do not await — return campaign id immediately
  fetch(functionUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      record: { id: data.id, world_description },
    }),
  }).catch((err) => {
    console.error('[generate-world] fire-and-forget fetch failed:', err)
  })

  return NextResponse.json({ id: data.id }, { status: 201 })
}
