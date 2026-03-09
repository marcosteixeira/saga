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

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  const { data: campaign, error: fetchError } = await (isUuid
    ? supabase.from('campaigns').select('id, host_user_id').eq('id', id).single()
    : supabase.from('campaigns').select('id, host_user_id').eq('slug', id).single())

  if (fetchError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.host_user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error: deleteError } = await supabase
    .from('messages')
    .delete()
    .eq('campaign_id', campaign.id)

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to delete messages' }, { status: 500 })
  }

  const { error: updateError } = await supabase
    .from('campaigns')
    .update({ status: 'lobby' })
    .eq('id', campaign.id)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to reset campaign' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
