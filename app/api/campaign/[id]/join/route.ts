import { NextRequest, NextResponse } from 'next/server'
import { createAuthServerClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { generateAndStoreImage } from '@/lib/image-gen'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = await createAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await params
  const supabase = createServerSupabaseClient()

  // 1. Fetch campaign
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, status, host_user_id')
    .eq('id', campaignId)
    .single()
  if (!campaign || campaignError) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }
  if (campaign.status !== 'lobby') {
    return NextResponse.json({ error: 'Campaign is not accepting players' }, { status: 400 })
  }

  // 2. Check not already joined
  const { data: existing } = await supabase
    .from('players')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'Already joined this campaign' }, { status: 409 })
  }

  // 3. Check player count
  const { data: players } = await supabase
    .from('players')
    .select('id')
    .eq('campaign_id', campaignId)
  if ((players?.length ?? 0) >= 6) {
    return NextResponse.json({ error: 'Campaign is full' }, { status: 409 })
  }

  // 4. Insert player
  const body = await request.json().catch(() => ({}))
  const username = user.user_metadata?.display_name ?? user.email ?? 'Adventurer'

  const { data: player, error: insertError } = await supabase
    .from('players')
    .insert({
      campaign_id: campaignId,
      user_id: user.id,
      username,
      is_host: false,
      character_name: body.character_name ?? null,
      character_class: body.character_class ?? null,
      character_backstory: body.character_backstory ?? null,
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: 'Failed to join' }, { status: 500 })
  }

  // Fire-and-forget: generate character portrait if character_name provided
  if (body.character_name) {
    const prompt = `Fantasy RPG character portrait: ${body.character_name}, a ${body.character_class ?? 'adventurer'}. ${(body.character_backstory ?? '').slice(0, 200)}`
    generateAndStoreImage({
      prompt,
      bucket: 'character-portraits',
      path: `${campaignId}/${player.id}.png`,
    }).then(url => {
      const supabaseAdmin = createServerSupabaseClient()
      return supabaseAdmin.from('players').update({ character_image_url: url }).eq('id', player.id)
    }).catch(() => { /* portrait generation is best-effort */ })
  }

  return NextResponse.json({ player }, { status: 201 })
}
