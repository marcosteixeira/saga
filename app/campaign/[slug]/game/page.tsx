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

  return (
    <GameClient
      campaign={campaign}
      world={world}
      players={players ?? []}
      messages={messages ?? []}
      currentUserId={user.id}
    />
  )
}
