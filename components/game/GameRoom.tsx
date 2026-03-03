'use client'
import { Campaign, Player, Message } from '@/types'
import PlayerList from './PlayerList'
import MessageFeed from './MessageFeed'
import ActionInput from './ActionInput'
import SceneImage from './SceneImage'
import { AmbientSmoke } from '@/components/ambient-smoke'
import { EmberParticles } from '@/components/ember-particles'

interface GameRoomProps {
  campaign: Campaign
  players: Player[]
  messages: Message[]
  currentPlayer: Player | null
}

export default function GameRoom({ campaign, players, messages, currentPlayer }: GameRoomProps) {
  const sceneImage = [...messages]
    .reverse()
    .find(m => m.type === 'narration' && m.image_url)?.image_url ?? null

  function handleSubmit(content: string) {
    // Wired in PR 11
    console.log('submit', content)
  }

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
              <MessageFeed messages={messages} players={players} />
            </div>
          </div>

          {/* Action input */}
          <div className="mt-2 flex-shrink-0">
            <ActionInput onSubmit={handleSubmit} />
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
