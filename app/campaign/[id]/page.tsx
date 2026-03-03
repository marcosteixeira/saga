'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Campaign, Player, Message } from '@/types'
import GameRoom from '@/components/game/GameRoom'
import { createClient } from '@/lib/supabase/client'

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const res = await fetch(`/api/campaign/${id}?include=messages`)
      const data = await res.json()

      if (data.campaign?.status === 'lobby') {
        router.replace(`/campaign/${id}/lobby`)
        return
      }
      if (data.campaign?.status === 'ended') {
        router.replace(`/campaign/${id}/summary`)
        return
      }

      setCampaign(data.campaign)
      setPlayers(data.players ?? [])
      setMessages(data.messages ?? [])

      if (user) {
        const me = (data.players ?? []).find((p: Player) => p.user_id === user.id) ?? null
        setCurrentPlayer(me)
      }

      setLoading(false)
    }

    load()
  }, [id, router])

  if (loading || !campaign) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="font-mono text-[--ash] animate-pulse">Loading...</p>
      </main>
    )
  }

  return (
    <GameRoom
      campaign={campaign}
      players={players}
      messages={messages}
      currentPlayer={currentPlayer}
    />
  )
}
