import { NextResponse } from 'next/server'
import { createAuthServerClient, createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const authClient = await createAuthServerClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()

  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, host_user_id, world_id, worlds(id, description)')
    .eq('id', id)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.host_user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const worldRaw = campaign.worlds
  const world = (Array.isArray(worldRaw) ? worldRaw[0] : worldRaw) as { id: string; description: string }

  const { error: updateError } = await supabase
    .from('worlds')
    .update({ status: 'generating', world_content: null })
    .eq('id', world.id)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update world status' }, { status: 500 })
  }

  const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-world`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.GENERATE_WORLD_WEBHOOK_SECRET) {
    headers.authorization = `Bearer ${process.env.GENERATE_WORLD_WEBHOOK_SECRET}`
  }

  fetch(functionUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      record: { id: world.id, description: world.description },
    }),
  }).catch((err) => {
    console.error('[generate-world] fire-and-forget fetch failed:', err)
  })

  return NextResponse.json({ ok: true }, { status: 202 })
}
