import { NextResponse } from 'next/server'
import { createAuthServerClient, createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(
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

  // Accept either a UUID (id) or a slug
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  const campaignQuery = isUuid
    ? supabase.from('campaigns').select('*, worlds(*)').eq('id', id).single()
    : supabase.from('campaigns').select('*, worlds(*)').eq('slug', id).single()

  const campaignResult = await campaignQuery
  if (campaignResult.error || !campaignResult.data) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const campaignId = campaignResult.data.id

  if (campaignResult.data.host_user_id !== user.id) {
    const { data: playerMembership, error: membershipError } = await supabase
      .from('players')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json({ error: 'Failed to verify campaign access' }, { status: 500 })
    }
    if (!playerMembership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const worldId = campaignResult.data.worlds?.id

  const [playersResult, imagesResult] = await Promise.all([
    supabase.from('players').select('*').eq('campaign_id', campaignId),
    worldId
      ? supabase
          .from('images')
          .select('entity_type, entity_id, image_type, public_url')
          .eq('status', 'ready')
          .in('entity_id', [campaignId, worldId])
          .not('public_url', 'is', null)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (playersResult.error || imagesResult.error) {
    return NextResponse.json({ error: 'Failed to load campaign data' }, { status: 500 })
  }

  // Separate world from campaign for a clean response shape
  const { worlds: world, ...campaign } = campaignResult.data

  const imageRows = imagesResult.data ?? []
  const findImageUrl = (entityType: string, entityId: string, imageType: string) =>
    imageRows.find(
      (r) => r.entity_type === entityType && r.entity_id === entityId && r.image_type === imageType
    )?.public_url ?? null

  return NextResponse.json({
    campaign,
    world,
    players: playersResult.data ?? [],
    world_cover_url: worldId ? findImageUrl('world', worldId, 'cover') : null,
    campaign_cover_url: findImageUrl('campaign', campaignId, 'cover'),
  })
}
