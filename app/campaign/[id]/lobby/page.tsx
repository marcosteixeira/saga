import { notFound } from 'next/navigation'
import { createAuthServerClient } from '@/lib/supabase/server'
import LobbyClient from './LobbyClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LobbyPage({ params }: Props) {
  const { id } = await params
  const supabase = await createAuthServerClient()

  const { data: { session } } = await supabase.auth.getSession()
  const currentUserId = session?.user?.id ?? null

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
  const players = playersResult.data ?? []

  if (!world) {
    notFound()
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
