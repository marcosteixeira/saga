'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { subscribeToPlayers, unsubscribeFromChannel } from '@/lib/realtime'
import { CharacterCreation } from '@/components/campaign/CharacterCreation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Campaign } from '@/types'
import type { Player } from '@/types'

export default function LobbyPage() {
  const { id: campaignId } = useParams<{ id: string }>()
  const router = useRouter()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [campaignRes, userRes] = await Promise.all([
        fetch(`/api/campaign/${campaignId}`).then(r => r.json()),
        supabase.auth.getUser()
      ])
      if (campaignRes.campaign?.status !== 'lobby') {
        router.replace(`/campaign/${campaignId}`)
        return
      }
      setCampaign(campaignRes.campaign)
      setPlayers(campaignRes.players ?? [])
      setCurrentUserId(userRes.data.user?.id ?? null)
      setIsLoading(false)
    }
    load()
  }, [campaignId, router])

  // Subscribe to realtime player changes
  useEffect(() => {
    if (!campaignId) return
    const channel = subscribeToPlayers(campaignId, (payload) => {
      if (payload.eventType === 'INSERT') {
        setPlayers(prev => {
          const incoming = payload.new as Player
          if (prev.some(p => p.id === incoming.id)) return prev
          return [...prev, incoming]
        })
      } else if (payload.eventType === 'UPDATE') {
        setPlayers(prev =>
          prev.map(p => p.id === (payload.new as Player).id ? { ...p, ...(payload.new as Player) } : p)
        )
      }
    })
    return () => { unsubscribeFromChannel(channel) }
  }, [campaignId])

  if (isLoading || !campaign) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="font-mono text-[--ash] animate-pulse">Loading...</p>
      </main>
    )
  }

  const isJoined = players.some(p => p.user_id === currentUserId)
  const isHost = campaign.host_user_id === currentUserId
  const nonHostPlayers = players.filter(p => p.user_id !== campaign.host_user_id)

  function handleJoined(player: Player) {
    setPlayers(prev => [...prev, player])
  }

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/campaign/${campaignId}/lobby`
    : ''

  return (
    <main
      className="relative min-h-screen p-8"
      style={{
        background: 'radial-gradient(ellipse at bottom, rgba(120,60,20,0.15) 0%, transparent 70%), #0a0a0a',
      }}
    >
      {/* Atmospheric overlays */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'4\' height=\'4\'%3E%3Crect width=\'1\' height=\'1\' fill=\'%23fff\'/%3E%3C/svg%3E")' }}
      />

      {/* Campaign info — Iron Plate panel */}
      <div
        className="mb-8 rounded border border-[--gunmetal] p-6 max-w-2xl"
        style={{ background: 'linear-gradient(135deg, #1a1a1a, #111)' }}
      >
        {campaign.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={campaign.cover_image_url}
            alt={campaign.name}
            className="mb-4 h-40 w-full rounded object-cover opacity-80"
          />
        )}
        <h1
          className="font-display text-4xl uppercase tracking-widest"
          style={{ color: 'var(--brass)', textShadow: '0 0 20px rgba(212,175,55,0.4)' }}
        >
          {campaign.name}
        </h1>
        {campaign.world_description && (
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[--ash]">
            {campaign.world_description.slice(0, 200)}
            {campaign.world_description.length > 200 ? '...' : ''}
          </p>
        )}
      </div>

      {!isJoined ? (
        <div className="max-w-md">
          {/* Player count badge */}
          <p className="mb-4 font-mono text-sm text-[--amber]">
            <span className="rounded bg-[--gunmetal] px-2 py-0.5">
              {String(players.length).padStart(2, '0')} / 06 players
            </span>
          </p>
          <CharacterCreation campaignId={campaignId} onJoined={handleJoined} />
        </div>
      ) : (
        <div className="max-w-2xl space-y-8">
          {/* Player list */}
          <div>
            <h2 className="mb-4 text-xl text-[--brass]" style={{ fontFamily: 'Rokkitt, serif' }}>
              Players{' '}
              <span className="font-mono text-sm text-[--ash]">
                {String(players.length).padStart(2, '0')} / 06
              </span>
            </h2>
            <div className="space-y-2">
              {players.map(player => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 rounded border border-[--gunmetal] p-3"
                  style={{ background: 'linear-gradient(135deg, #1a1a1a, #111)' }}
                >
                  <Avatar>
                    <AvatarImage src={player.character_image_url ?? undefined} />
                    <AvatarFallback className="bg-[--gunmetal] text-[--steam]">
                      {player.username[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-[--steam]" style={{ fontFamily: 'Rokkitt, serif' }}>
                      {player.username}
                    </p>
                    {player.character_class && (
                      <p className="text-xs text-[--ash]" style={{ fontFamily: 'Barlow Condensed, sans-serif', fontVariant: 'small-caps' }}>
                        {player.character_class}
                      </p>
                    )}
                  </div>
                  {player.user_id === campaign.host_user_id && (
                    <Badge
                      variant="outline"
                      className="ml-auto border-[--brass] text-[--brass]"
                    >
                      Host
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Share link */}
          <div className="rounded border border-[--copper] p-4">
            <p className="mb-2 font-mono text-xs uppercase tracking-widest text-[--copper]">
              Share this link
            </p>
            <p className="break-all font-mono text-sm text-[--steam]">{shareUrl}</p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-[--brass] hover:text-[--furnace]"
              onClick={() => navigator.clipboard.writeText(shareUrl)}
            >
              Copy Link
            </Button>
          </div>

          {/* Host controls / waiting */}
          {isHost ? (
            <Button
              className="w-full max-w-xs bg-[--brass] text-black hover:bg-[--furnace] disabled:bg-[--gunmetal] disabled:text-[--ash] disabled:opacity-50"
              disabled={nonHostPlayers.length === 0}
              onClick={() => {/* Start session — PR 08 */}}
            >
              Start Session
            </Button>
          ) : (
            <p
              className="italic text-[--ash] animate-pulse"
              style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
            >
              Waiting for host to start the session...
            </p>
          )}
        </div>
      )}
    </main>
  )
}
