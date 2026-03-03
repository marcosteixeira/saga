'use client'
import { useEffect, useRef } from 'react'
import { Message, Player } from '@/types'

interface MessageFeedProps {
  messages: Message[]
  players: Player[]
  streamingContent?: string | null
  streamingMessageId?: string | null
}

function getPlayer(players: Player[], playerId: string | null) {
  if (!playerId) return null
  return players.find(p => p.id === playerId) ?? null
}

function NarrationMessage({ message }: { message: Message }) {
  return (
    <div
      className="py-2 px-3"
      style={{ borderLeft: '3px solid var(--brass)' }}
    >
      <p
        className="text-xs uppercase mb-1"
        style={{
          fontFamily: 'var(--font-mono), monospace',
          color: 'var(--brass)',
          letterSpacing: '0.1em',
        }}
      >
        ⚙ Game Master
      </p>
      <p
        style={{
          fontFamily: 'var(--font-heading), serif',
          color: 'var(--steam)',
          lineHeight: 1.7,
          fontSize: '0.95rem',
        }}
      >
        {message.content}
      </p>
      {message.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={message.image_url}
          alt="Scene"
          className="mt-2 rounded-sm max-w-full"
          style={{ border: '1px solid var(--gunmetal)' }}
        />
      )}
    </div>
  )
}

function ActionMessage({ message, player }: { message: Message; player: Player | null }) {
  const name = player?.character_name ?? player?.username ?? 'Unknown'
  return (
    <div className="py-1.5 px-3">
      <p
        style={{
          fontFamily: 'var(--font-body), sans-serif',
          color: 'var(--steam)',
          fontSize: '0.9rem',
        }}
      >
        <span style={{ color: 'var(--amber-glow)', fontWeight: 600 }}>{name}:</span>{' '}
        {message.content}
      </p>
    </div>
  )
}

function SystemMessage({ message }: { message: Message }) {
  return (
    <div className="py-1 px-3 text-center">
      <p
        style={{
          fontFamily: 'var(--font-mono), monospace',
          color: 'var(--ash)',
          fontSize: '0.75rem',
          letterSpacing: '0.05em',
        }}
      >
        {message.content}
      </p>
    </div>
  )
}

function OOCMessage({ message, player }: { message: Message; player: Player | null }) {
  const name = player?.character_name ?? player?.username ?? 'Unknown'
  return (
    <div className="py-1.5 px-3">
      <p
        style={{
          fontFamily: 'var(--font-body), sans-serif',
          color: 'var(--ash)',
          fontSize: '0.85rem',
          fontStyle: 'italic',
        }}
      >
        <span style={{ color: 'var(--gunmetal)', fontWeight: 600 }}>[OOC]</span>{' '}
        <span style={{ color: 'var(--ash)' }}>{name}:</span> {message.content}
      </p>
    </div>
  )
}

export default function MessageFeed({
  messages,
  players,
  streamingContent,
  streamingMessageId,
}: MessageFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const userScrolled = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    function onScroll() {
      const c = containerRef.current
      if (!c) return
      const atBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 60
      userScrolled.current = !atBottom
    }

    container.addEventListener('scroll', onScroll)
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!userScrolled.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streamingContent])

  // Scroll to bottom on initial load
  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [])

  const isStreaming = streamingContent != null && streamingContent.length > 0

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto scrollbar-thin"
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) var(--gunmetal)' }}
    >
      <div className="flex flex-col gap-0.5 py-2">
        {messages.length === 0 && !isStreaming && (
          <p
            className="text-center py-8"
            style={{
              fontFamily: 'var(--font-mono), monospace',
              color: 'var(--ash)',
              fontSize: '0.75rem',
            }}
          >
            The adventure has not yet begun...
          </p>
        )}
        {messages.map(message => {
          const player = getPlayer(players, message.player_id)
          switch (message.type) {
            case 'narration':
              return <NarrationMessage key={message.id} message={message} />
            case 'action':
              return <ActionMessage key={message.id} message={message} player={player} />
            case 'system':
              return <SystemMessage key={message.id} message={message} />
            case 'ooc':
              return <OOCMessage key={message.id} message={message} player={player} />
          }
        })}
        {isStreaming && (
          <div
            key={streamingMessageId ?? 'streaming'}
            className="py-2 px-3"
            style={{ borderLeft: '3px solid var(--brass)' }}
          >
            <p
              className="text-xs uppercase mb-1"
              style={{
                fontFamily: 'var(--font-mono), monospace',
                color: 'var(--brass)',
                letterSpacing: '0.1em',
              }}
            >
              ⚙ Game Master
            </p>
            <p
              style={{
                fontFamily: 'var(--font-heading), serif',
                color: 'var(--steam)',
                lineHeight: 1.7,
                fontSize: '0.95rem',
              }}
            >
              {streamingContent}
              <span
                style={{
                  display: 'inline-block',
                  width: '2px',
                  height: '1em',
                  background: 'var(--brass)',
                  marginLeft: '1px',
                  verticalAlign: 'text-bottom',
                  animation: 'blink-cursor 1s step-end infinite',
                }}
              />
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <style>{`
        @keyframes blink-cursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
