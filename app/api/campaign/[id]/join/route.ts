import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'

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

  const body = await req.json()
  const username: string = body.username?.trim()

  if (!username) {
    return NextResponse.json({ error: 'Missing required field: username' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  const { data: campaign, error: campError } = await supabase
    .from('campaigns')
    .select('id, status')
    .eq('id', campaignId)
    .single()

  if (campError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.status !== 'lobby') {
    return NextResponse.json({ error: 'Campaign has already started' }, { status: 409 })
  }

  const { data: existing } = await supabase
    .from('players')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    return NextResponse.json({ player: existing }, { status: 200 })
  }

  const { data: player, error: insertError } = await supabase
    .from('players')
    .insert({
      campaign_id: campaignId,
      user_id: user.id,
      username,
      is_host: false,
    })
    .select('*')
    .single()

  if (insertError || !player) {
    return NextResponse.json({ error: 'Failed to join campaign' }, { status: 500 })
  }

  return NextResponse.json({ player }, { status: 201 })
}
