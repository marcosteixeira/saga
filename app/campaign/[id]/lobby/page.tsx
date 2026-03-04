import { notFound } from 'next/navigation'
import { createAuthServerClient, createServerSupabaseClient } from '@/lib/supabase/server'
import LobbyClient from './LobbyClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LobbyPage({ params }: Props) {
  const { id } = await params
  const supabase = await createAuthServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  const currentUserId = user?.id ?? null

  const [campaignResult, playersResult] = await Promise.all([
    supabase.from('campaigns').select('*, worlds(*)').eq('id', id).single(),
    supabase.from('players').select('*').eq('campaign_id', id),
  ])

  if (campaignResult.error || !campaignResult.data) {
    notFound()
  }

  if (playersResult.error) {
    notFound()
  }

  const { worlds: world, ...campaign } = campaignResult.data
  let players = playersResult.data ?? []

  if (!world) {
    notFound()
  }

  // If the current user has no player row yet, create one now
  if (user && !players.find((p) => p.user_id === user.id)) {
    const username =
      user.user_metadata?.display_name || user.email || 'Unknown'
    const isHost = campaign.host_user_id === user.id
    const db = createServerSupabaseClient()
    const { data: newPlayer } = await db
      .from('players')
      .insert({ campaign_id: id, user_id: user.id, username, is_host: isHost })
      .select('*')
      .single()

    if (newPlayer) {
      players = [...players, newPlayer]
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
