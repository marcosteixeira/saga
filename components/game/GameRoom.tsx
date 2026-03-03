'use client'
import { useState, useEffect, useCallback } from 'react'
import { Campaign, Player, Message } from '@/types'
import PlayerList from './PlayerList'
import MessageFeed from './MessageFeed'
import ActionInput from './ActionInput'
import SceneImage from './SceneImage'
import TurnIndicator from './TurnIndicator'
import { AmbientSmoke } from '@/components/ambient-smoke'
import { EmberParticles } from '@/components/ember-particles'
import { useNarrationStream } from '@/lib/use-narration-stream'
import { useTurnTimer } from '@/lib/turn-timer'
import { createClient } from '@/lib/supabase/client'

const TURN_TIMER_SECONDS = 120

interface GameRoomProps {
  campaign: Campaign
  players: Player[]
  messages: Message[]
  currentPlayer: Player | null
}

export default function GameRoom({ campaign, players, messages: initialMessages, currentPlayer }: GameRoomProps) {
  const { isStreaming, streamingContent, streamingMessageId } = useNarrationStream(campaign.id)
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [hasSubmitted, setHasSubmitted] = useState(false)

  const activePlayers = players.filter(p => p.status === 'active')
  const submittedCount = (() => {
    const lastNarration = [...messages].reverse().find(m => m.type === 'narration')
    const sinceTime = lastNarration?.created_at ?? new Date(0).toISOString()
    const submittedIds = new Set(
      messages
        .filter(m => m.type === 'action' && m.created_at > sinceTime)
        .map(m => m.player_id)
        .filter(Boolean)
    )
    return activePlayers.filter(p => submittedIds.has(p.id)).length
  })()

  const allSubmitted = activePlayers.length > 0 && submittedCount >= activePlayers.length

  const handleTimerExpire = useCallback(async () => {
    if (isStreaming) return
    await fetch(`/api/campaign/${campaign.id}/narrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    })
  }, [campaign.id, isStreaming])

  const { timeRemaining, reset: resetTimer } = useTurnTimer(TURN_TIMER_SECONDS, handleTimerExpire)

  // Reset timer and submitted state when narration completes
  useEffect(() => {
    if (!isStreaming) {
      setHasSubmitted(false)
      resetTimer()
    }
  }, [isStreaming]) // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to realtime action broadcasts
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`campaign:${campaign.id}:messages`)
      .on('broadcast', { event: 'new_message' }, ({ payload }) => {
        setMessages(prev => {
          if (prev.some(m => m.id === payload.id)) return prev
          return [...prev, payload as Message]
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [campaign.id])

  async function handleSubmit(content: string) {
    const res = await fetch(`/api/campaign/${campaign.id}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, type: 'action' }),
    })
    if (res.ok) {
      setHasSubmitted(true)
    }
  }

  const sceneImage = [...messages]
    .reverse()
    .find(m => m.type === 'narration' && m.image_url)?.image_url ?? null

  return (
    <div className="relative h-screen overflow-hidden bg-[--soot]">
      {/* Atmospheric layers */}
      <div className="furnace-overlay" />
      <div className="vignette" />
      <div className="smog-layer">
        <div className="smog-band" style={{ top: '20%', '--smog-speed': '35s' } as React.CSSProperties} />
        <div className="smog-band" style={{ top: '60%', '--smog-speed': '45s', animationDelay: '-15s' } as React.CSSProperties} />
      </div>
      <AmbientSmoke />
      <EmberParticles count={12} />

      {/* Layout: sidebar + center, full height */}
      <div className="relative z-10 flex h-screen overflow-hidden">
        {/* Left sidebar — Player List */}
        <aside
          className="iron-plate flex-shrink-0 flex flex-col overflow-hidden"
          style={{ width: '220px', margin: '8px 0 8px 8px' }}
        >
          <div className="rivet-bottom-left" />
          <div className="rivet-bottom-right" />
          <div className="px-3 py-2 border-b border-[--gunmetal]">
            <h2 className="text-[--brass] text-xs uppercase tracking-widest font-mono">
              Crew — {campaign.name}
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <PlayerList players={players} currentPlayer={currentPlayer} />
          </div>
        </aside>

        {/* Brass pipe separator */}
        <div
          className="flex-shrink-0 self-stretch flex items-center"
          style={{ width: '8px', padding: '8px 0' }}
        >
          <div
            className="w-[4px] h-full mx-auto rounded-sm"
            style={{
              background: 'linear-gradient(180deg, var(--copper) 0%, var(--brass) 40%, var(--copper) 100%)',
              boxShadow: '0 0 4px rgba(196,148,61,0.3)',
            }}
          />
        </div>

        {/* Center column */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ margin: '8px 8px 8px 0' }}>
          {/* Scene image */}
          <SceneImage imageUrl={sceneImage} />

          {/* Message feed */}
          <div className="iron-plate flex-1 flex flex-col overflow-hidden">
            <div className="rivet-bottom-left" />
            <div className="rivet-bottom-right" />
            <div className="flex-1 overflow-hidden">
              <MessageFeed
                messages={messages}
                players={players}
                streamingContent={isStreaming ? streamingContent : null}
                streamingMessageId={streamingMessageId}
              />
            </div>
          </div>

          {/* Turn indicator + Narrating indicator + Action input */}
          <div className="mt-2 flex-shrink-0">
            {!isStreaming && (
              <TurnIndicator
                submitted={submittedCount}
                total={activePlayers.length}
                timeRemaining={timeRemaining}
                timerSeconds={TURN_TIMER_SECONDS}
                allSubmitted={allSubmitted}
              />
            )}
            {isStreaming && (
              <div
                className="flex items-center gap-2 px-3 py-1 mb-1"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{
                    background: 'var(--furnace)',
                    animation: 'pulse 1s ease-in-out infinite',
                    boxShadow: '0 0 6px var(--furnace)',
                  }}
                />
                <span
                  className="text-xs uppercase tracking-widest"
                  style={{ color: 'var(--copper)' }}
                >
                  GM IS NARRATING...
                </span>
              </div>
            )}
            <ActionInput
              onSubmit={handleSubmit}
              disabled={isStreaming}
              submitted={hasSubmitted && !isStreaming}
              placeholder={isStreaming ? 'THE GAME MASTER SPEAKS...' : 'Describe your action...'}
            />
          </div>
        </div>
      </div>

      {/* Custom scrollbar styles */}
      <style>{`
        .scrollbar-thin::-webkit-scrollbar { width: 6px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: var(--gunmetal); }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: var(--brass); border-radius: 3px; }
      `}</style>
    </div>
  )
}
