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

  // Determine if the opening scene is ready (AI generation may still be in progress)
  const { data: session } = await db
    .from('sessions')
    .select('opening_situation, scene_image_url')
    .eq('campaign_id', campaign.id)
    .eq('session_number', 1)
    .maybeSingle()

  const openingReady = !!session?.opening_situation

  // Loading background: session scene → world map → world cover
  const loadingImageUrl =
    session?.scene_image_url ??
    world.map_image_url ??
    world.cover_image_url ??
    undefined

  return (
    <GameClient
      campaign={campaign}
      world={world}
      players={players ?? []}
      messages={messages ?? []}
      currentUserId={user.id}
      openingReady={openingReady}
      loadingImageUrl={loadingImageUrl}
    />
  )
}
