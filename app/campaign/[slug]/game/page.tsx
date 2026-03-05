import { notFound, redirect } from 'next/navigation'
import { createAuthServerClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { pickLatestImageUrl } from '@/lib/image-selection'
import GameClient from './GameClient'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function GamePage({ params }: Props) {
  const { slug } = await params
  const supabase = await createAuthServerClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/campaign/${slug}/game`)}`)
  }

  const campaignResult = await supabase
    .from('campaigns')
    .select('*, worlds(*)')
    .eq('slug', slug)
    .single()

  if (campaignResult.error || !campaignResult.data) {
    notFound()
  }

  const { worlds: world, ...campaign } = campaignResult.data

  if (!world) {
    notFound()
  }

  if (campaign.status !== 'active') {
    redirect(`/campaign/${slug}/lobby`)
  }

  const membershipResult = await supabase
    .from('players')
    .select('id')
    .eq('campaign_id', campaign.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipResult.error || !membershipResult.data) {
    notFound()
  }

  // Fetch players
  const db = createServerSupabaseClient()
  const { data: players } = await db
    .from('players')
    .select('*')
    .eq('campaign_id', campaign.id)

  // Fetch recent messages (last 50)
  const { data: messages } = await db
    .from('messages')
    .select('*')
    .eq('campaign_id', campaign.id)
    .order('created_at', { ascending: true })
    .limit(50)

  // Fetch images for initial render (world cover/map, campaign cover, player portraits)
  const playerIds = (players ?? []).map((p) => p.id)
  const imageEntityIds = [world.id, campaign.id, ...playerIds]

  const { data: imageRows } = await db
    .from('images')
    .select('entity_type, entity_id, image_type, public_url, created_at')
    .eq('status', 'ready')
    .in('entity_id', imageEntityIds)

  const findImage = (entityType: string, entityId: string, imageType: string) =>
    pickLatestImageUrl(imageRows, entityType, entityId, imageType)

  const worldCoverUrl = findImage('world', world.id, 'cover')
  const worldMapUrl = findImage('world', world.id, 'map')
  const campaignCoverUrl = findImage('campaign', campaign.id, 'cover')

  const initialPlayerImages: Record<string, string> = {}
  for (const p of players ?? []) {
    const url = findImage('player', p.id, 'character')
    if (url) initialPlayerImages[p.id] = url
  }

  const openingReady = !!campaign.opening_situation

  // Loading background: campaign cover → world map → world cover
  const loadingImageUrl = campaignCoverUrl ?? worldMapUrl ?? worldCoverUrl ?? undefined

  return (
    <GameClient
      campaign={campaign}
      world={world}
      players={players ?? []}
      messages={messages ?? []}
      currentUserId={user.id}
      openingReady={openingReady}
      loadingImageUrl={loadingImageUrl}
      campaignCoverImageUrl={campaignCoverUrl ?? worldCoverUrl ?? undefined}
      initialPlayerImages={initialPlayerImages}
    />
  )
}
