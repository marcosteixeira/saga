import { notFound, redirect } from 'next/navigation'
import { createAuthServerClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { broadcastPlayerJoin } from '@/lib/realtime-broadcast'
import LobbyClient from './LobbyClient'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function LobbyPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createAuthServerClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(`/campaign/${slug}/lobby`)}`)
  }

  const currentUserId = user.id

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
  const campaignId = campaign.id

  if (campaign.status === 'active') {
    redirect(`/campaign/${slug}/game`)
  }

  if (!world) {
    notFound()
  }

  const playersResult = await db
    .from('players')
    .select('*')
    .eq('campaign_id', campaignId)

  if (playersResult.error) {
    notFound()
  }

  let players = playersResult.data ?? []

  // If the current user has no player row yet, create one now
  if (user && !players.find((p) => p.user_id === user.id)) {
    const username =
      user.user_metadata?.display_name || user.email || 'Unknown'
    const isHost = campaign.host_user_id === user.id
    const { data: newPlayer } = await db
      .from('players')
      .upsert(
        { campaign_id: campaignId, user_id: user.id, username, is_host: isHost },
        { onConflict: 'campaign_id,user_id', ignoreDuplicates: true }
      )
      .select('*')
      .single()

    if (newPlayer) {
      players = [...players, newPlayer]
      await broadcastPlayerJoin(campaignId, newPlayer)
    }
  }

  return (
    <LobbyClient
      campaign={campaign}
      world={world}
      players={players}
      currentUserId={currentUserId}
    />
  )
}
