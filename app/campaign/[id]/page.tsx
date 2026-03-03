'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
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
  const [notFound, setNotFound] = useState(false)
  const [notJoined, setNotJoined] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      const res = await fetch(`/api/campaign/${id}?include=messages`)
      if (!res.ok) {
        setNotFound(true)
        setLoading(false)
        return
      }
      const data = await res.json()

      if (!data.campaign) {
        setNotFound(true)
        setLoading(false)
        return
      }

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
        if (!me) {
          setNotJoined(true)
          setLoading(false)
          return
        }
      }

      setLoading(false)
    }

    load()
  }, [id, router])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-soot">
        <p
          className="animate-pulse uppercase tracking-widest text-sm"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--ash)' }}
        >
          Loading...
        </p>
      </main>
    )
  }

  if (notFound) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-soot">
        <div className="furnace-overlay" aria-hidden="true" />
        <div className="vignette" aria-hidden="true" />
        <div className="relative z-10 text-center px-6 max-w-md">
          <h1
            className="uppercase mb-4"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(2rem, 6vw, 3.5rem)',
              color: 'var(--furnace)',
              textShadow: '0 0 40px rgba(212,98,42,0.5)',
              letterSpacing: '0.15em',
            }}
          >
            Campaign Not Found
          </h1>
          <p className="mb-6 text-sm" style={{ fontFamily: 'var(--font-body)', color: 'var(--ash)' }}>
            This campaign does not exist or has been dissolved. The records are lost.
          </p>
          <Link
            href="/"
            className="uppercase tracking-widest text-sm"
            style={{ fontFamily: 'var(--font-body)', color: 'var(--amber-glow)', textDecoration: 'underline' }}
          >
            ← Return to Lobby
          </Link>
        </div>
      </main>
    )
  }

  if (notJoined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-soot">
        <div className="furnace-overlay" aria-hidden="true" />
        <div className="vignette" aria-hidden="true" />
        <div className="relative z-10 text-center px-6 max-w-md">
          <h1
            className="uppercase mb-4"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.5rem, 5vw, 2.5rem)',
              color: 'var(--brass)',
              letterSpacing: '0.15em',
            }}
          >
            Not a Member
          </h1>
          <p className="mb-6 text-sm" style={{ fontFamily: 'var(--font-body)', color: 'var(--steam)' }}>
            You haven&apos;t joined this campaign. Ask the host for an invitation link to take your seat at the table.
          </p>
          <Link
            href="/"
            className="uppercase tracking-widest text-sm"
            style={{ fontFamily: 'var(--font-body)', color: 'var(--amber-glow)', textDecoration: 'underline' }}
          >
            ← Return to Lobby
          </Link>
        </div>
      </main>
    )
  }

  if (!campaign) return null

  return (
    <GameRoom
      campaign={campaign}
      players={players}
      messages={messages}
      currentPlayer={currentPlayer}
    />
  )
}
