import { notFound, redirect } from 'next/navigation'
import { createAuthServerClient, createServerSupabaseClient } from '@/lib/supabase/server'
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

  const db = createServerSupabaseClient()
  const campaignResult = await db
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

  const [playersResult, messagesResult, imagesResult] = await Promise.all([
    db.from('players').select('*').eq('campaign_id', campaign.id),
    db.from('messages').select('*').eq('campaign_id', campaign.id).order('created_at', { ascending: false }).limit(50),
    db.from('images').select('entity_type, entity_id, image_type, public_url').eq('status', 'ready').in('entity_id', [world.id, campaign.id]),
  ])

  const imageRows = imagesResult.data ?? []
  const findUrl = (entityType: string, entityId: string, imageType: string) =>
    imageRows.find((r) => r.entity_type === entityType && r.entity_id === entityId && r.image_type === imageType)?.public_url ?? null

  const worldWithImages = { ...world, cover_url: findUrl('world', world.id, 'cover'), map_url: findUrl('world', world.id, 'map') }
  const campaignWithImages = { ...campaign, cover_url: findUrl('campaign', campaign.id, 'cover') }

  // Loading background: campaign cover → world cover → world map
  const loadingImageUrl = campaignWithImages.cover_url ?? worldWithImages.cover_url ?? worldWithImages.map_url ?? undefined

  return (
    <GameClient
      campaign={campaignWithImages}
      world={worldWithImages}
      players={playersResult.data ?? []}
      messages={(messagesResult.data ?? []).reverse()}
      currentUserId={user.id}
      loadingImageUrl={loadingImageUrl}
      campaignCoverImageUrl={campaignWithImages.cover_url ?? worldWithImages.cover_url ?? undefined}
    />
  )
}
