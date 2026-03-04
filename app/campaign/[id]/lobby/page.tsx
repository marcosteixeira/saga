'use client'

import { type ReactElement, useState } from 'react'
import { EmberParticles } from '@/components/ember-particles'
import { AmbientSmoke } from '@/components/ambient-smoke'
import { GearDecoration } from '@/components/gear-decoration'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

type CharacterClass = 'Warrior' | 'Rogue' | 'Mage' | 'Cleric' | 'Ranger' | 'Bard'

type PlayerStatus = 'ready' | 'not_ready' | 'empty'

interface Player {
  id: string
  username: string
  characterName: string
  characterClass: CharacterClass
  backstory: string
  isHost: boolean
  isCurrentUser: boolean
  status: PlayerStatus
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_CAMPAIGN = {
  name: 'The Iron Meridian',
  worldDescription:
    'A shattered continent bound together by ancient brass machinery and the will of steam-powered gods.',
  hostUsername: 'marco',
}

const INITIAL_PLAYERS: (Player | null)[] = [
  {
    id: '1',
    username: 'marco',
    characterName: 'Aldric Voss',
    characterClass: 'Warrior',
    backstory: 'A disgraced knight seeking redemption in the forgotten ruins of the old empire.',
    isHost: true,
    isCurrentUser: true,
    status: 'not_ready',
  },
  {
    id: '2',
    username: 'sara',
    characterName: 'Nyx Ashveil',
    characterClass: 'Rogue',
    backstory: '',
    isHost: false,
    isCurrentUser: false,
    status: 'ready',
  },
  {
    id: '3',
    username: 'paulo',
    characterName: '',
    characterClass: 'Mage',
    backstory: '',
    isHost: false,
    isCurrentUser: false,
    status: 'not_ready',
  },
  null, // empty slot
  null,
  null,
]

// ─── SVG Class Icons ──────────────────────────────────────────────────────────

const CLASS_ICONS: Record<CharacterClass, ReactElement> = {
  Warrior: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M14.5 3.5 L20.5 9.5 L9 21 L3 21 L3 15 Z" />
      <path d="M14.5 3.5 L16.5 1.5 L22.5 7.5 L20.5 9.5" />
      <path d="M8 16 L6 18" />
    </svg>
  ),
  Rogue: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M20 4 L4 20" />
      <path d="M20 4 L17 7" />
      <path d="M4 20 L7 17" />
      <circle cx="12" cy="12" r="2" />
      <path d="M15 9 L9 15" />
    </svg>
  ),
  Mage: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M5 19 L15 9" />
      <path d="M15 9 L17 5 L19 7 L15 9Z" fill="currentColor" fillOpacity={0.3} />
      <circle cx="5" cy="19" r="1.5" />
      <path d="M9 13 L7 15" />
      <path d="M12 10 L10 12" />
      <path d="M18 3 L20 5 M19 3 L19 5 M18 4 L20 4" strokeWidth={1} />
    </svg>
  ),
  Cleric: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M12 3 L12 21" />
      <path d="M7 8 L17 8" />
      <path d="M9 3 C9 6 7 8 7 8 C7 8 9 10 12 10 C15 10 17 8 17 8 C17 8 15 6 15 3" strokeWidth={1} />
    </svg>
  ),
  Ranger: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M5 19 C5 11 10 6 18 5" />
      <path d="M5 19 C13 19 18 14 19 6" />
      <path d="M18 5 L19 6" />
      <path d="M12 12 L20 4 L21 7 L18 8Z" fill="currentColor" fillOpacity={0.3} />
    </svg>
  ),
  Bard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <ellipse cx="7" cy="18" rx="4" ry="2.5" transform="rotate(-30 7 18)" />
      <path d="M10.5 16 L18 5" />
      <path d="M18 5 L20 7" />
      <path d="M14 10 L16 12" strokeWidth={1} />
      <path d="M16 8 L18 10" strokeWidth={1} />
    </svg>
  ),
}

const CLASSES: CharacterClass[] = ['Warrior', 'Rogue', 'Mage', 'Cleric', 'Ranger', 'Bard']

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PlayerStatus }) {
  if (status === 'ready') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-heading tracking-widest uppercase"
        style={{ color: 'var(--patina)', border: '1px solid var(--patina)', background: 'rgba(90,122,109,0.12)' }}>
        <svg viewBox="0 0 10 10" fill="currentColor" className="w-2 h-2">
          <path d="M1.5 5.5 L4 8 L8.5 2.5" stroke="currentColor" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Ready
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-heading tracking-widest uppercase"
      style={{ color: 'var(--amber-glow)', border: '1px solid rgba(232,168,53,0.35)', background: 'rgba(232,168,53,0.08)' }}>
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'var(--amber-glow)', animation: 'pulse 2s ease-in-out infinite' }} />
      Not Ready
    </span>
  )
}

function PlayerCard({
  player,
  onMarkReady,
  isHost,
}: {
  player: Player
  onMarkReady?: (id: string) => void
  isHost: boolean
}) {
  const isOwn = player.isCurrentUser

  return (
    <div
      className="relative iron-plate p-4 flex items-start gap-4 transition-all duration-300"
      style={{
        borderColor: player.status === 'ready'
          ? 'rgba(196,148,61,0.5)'
          : isOwn
          ? 'rgba(196,148,61,0.25)'
          : 'var(--gunmetal)',
        boxShadow: player.status === 'ready'
          ? '0 0 20px rgba(196,148,61,0.08), inset 0 0 20px rgba(196,148,61,0.04)'
          : isOwn
          ? '0 0 12px rgba(196,148,61,0.04)'
          : 'none',
        animation: 'fadeInUp 0.5s ease-out both',
      }}
    >
      {/* Own card left accent */}
      {isOwn && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l"
          style={{ background: 'linear-gradient(to bottom, transparent, var(--brass), transparent)' }} />
      )}

      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div
          className="w-12 h-12 rounded flex items-center justify-center text-lg font-heading tracking-wider"
          style={{
            background: 'var(--smog)',
            border: '1px solid var(--gunmetal)',
            color: 'var(--ash)',
          }}
        >
          {player.characterName
            ? player.characterName.charAt(0).toUpperCase()
            : player.username.charAt(0).toUpperCase()}
        </div>
        {/* Class icon badge */}
        <div
          className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-sm flex items-center justify-center"
          style={{ background: 'var(--iron)', border: '1px solid var(--gunmetal)', color: 'var(--brass)' }}
        >
          <div className="w-3 h-3">{CLASS_ICONS[player.characterClass]}</div>
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-heading text-sm tracking-wide" style={{ color: 'var(--steam)' }}>
            {player.characterName || <span style={{ color: 'var(--ash)', fontStyle: 'italic' }}>No character yet</span>}
          </span>
          {isOwn && (
            <span className="text-xs px-1.5 py-0 font-mono rounded" style={{ background: 'rgba(196,148,61,0.12)', color: 'var(--brass)', border: '1px solid rgba(196,148,61,0.2)' }}>
              You
            </span>
          )}
          {player.isHost && (
            <span className="text-xs px-1.5 py-0 font-mono rounded" style={{ background: 'rgba(90,122,109,0.12)', color: 'var(--patina)', border: '1px solid rgba(90,122,109,0.2)' }}>
              Host
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="font-mono text-xs uppercase tracking-widest" style={{ color: 'var(--ash)' }}>
            {player.characterClass}
          </span>
          <span className="text-xs" style={{ color: 'var(--gunmetal)' }}>·</span>
          <span className="text-xs" style={{ color: 'var(--ash)' }}>@{player.username}</span>
        </div>
        <div className="mt-2">
          <StatusBadge status={player.status} />
        </div>
      </div>

      {/* Host action */}
      {isHost && !isOwn && player.status === 'not_ready' && onMarkReady && (
        <button
          onClick={() => onMarkReady(player.id)}
          className="flex-shrink-0 text-xs px-2.5 py-1.5 font-heading tracking-widest uppercase transition-all duration-200"
          style={{
            border: '1px solid rgba(196,148,61,0.3)',
            color: 'var(--ash)',
            background: 'transparent',
          }}
          onMouseEnter={e => {
            const t = e.currentTarget
            t.style.borderColor = 'var(--brass)'
            t.style.color = 'var(--brass)'
          }}
          onMouseLeave={e => {
            const t = e.currentTarget
            t.style.borderColor = 'rgba(196,148,61,0.3)'
            t.style.color = 'var(--ash)'
          }}
        >
          Mark Ready
        </button>
      )}
    </div>
  )
}

function EmptySlot({ index }: { index: number }) {
  return (
    <div
      className="relative p-4 flex items-center gap-4"
      style={{
        border: '1px dashed var(--gunmetal)',
        background: 'rgba(26,24,20,0.3)',
        animation: `fadeInUp 0.5s ease-out ${index * 60}ms both`,
      }}
    >
      <div className="w-12 h-12 rounded flex items-center justify-center"
        style={{ background: 'rgba(26,24,20,0.6)', border: '1px dashed rgba(61,54,48,0.5)' }}>
        <span className="font-mono text-xs" style={{ color: 'var(--gunmetal)' }}>0{index + 1}</span>
      </div>
      <span className="text-sm italic" style={{ color: 'var(--gunmetal)' }}>Waiting for player…</span>
    </div>
  )
}

function ClassButton({
  cls,
  selected,
  onSelect,
}: {
  cls: CharacterClass
  selected: boolean
  onSelect: (c: CharacterClass) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(cls)}
      className="relative flex flex-col items-center gap-1.5 p-3 transition-all duration-200 rounded-sm"
      style={{
        border: selected ? '1px solid var(--brass)' : '1px solid var(--gunmetal)',
        background: selected ? 'rgba(196,148,61,0.1)' : 'rgba(26,24,20,0.6)',
        color: selected ? 'var(--brass)' : 'var(--ash)',
        boxShadow: selected ? '0 0 12px rgba(196,148,61,0.12), inset 0 0 8px rgba(196,148,61,0.06)' : 'none',
      }}
      onMouseEnter={e => {
        if (!selected) {
          e.currentTarget.style.borderColor = 'rgba(196,148,61,0.4)'
          e.currentTarget.style.color = 'var(--steam)'
        }
      }}
      onMouseLeave={e => {
        if (!selected) {
          e.currentTarget.style.borderColor = 'var(--gunmetal)'
          e.currentTarget.style.color = 'var(--ash)'
        }
      }}
    >
      {CLASS_ICONS[cls]}
      <span className="font-mono text-xs uppercase tracking-widest leading-none">{cls}</span>
      {selected && (
        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--brass)' }} />
      )}
    </button>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LobbyPage() {
  const [players, setPlayers] = useState<(Player | null)[]>(INITIAL_PLAYERS)
  const [isReady, setIsReady] = useState(false)

  // Own character form state (current user = players[0])
  const currentUser = players[0] as Player
  const [charName, setCharName] = useState(currentUser.characterName)
  const [charClass, setCharClass] = useState<CharacterClass>(currentUser.characterClass)
  const [backstory, setBackstory] = useState(currentUser.backstory)
  const [formDirty, setFormDirty] = useState(false)
  const [charSaved, setCharSaved] = useState(!!currentUser.characterName)

  // Derived
  const filledPlayers = players.filter((p): p is Player => p !== null)
  const readyCount = filledPlayers.filter(p => p.status === 'ready').length
  const allReady = filledPlayers.length > 0 && filledPlayers.every(p => p.status === 'ready')

  const isHost = currentUser.isHost

  function saveCharacter() {
    if (!charName.trim() || !charClass) return
    setPlayers(prev =>
      prev.map(p =>
        p?.isCurrentUser
          ? { ...p, characterName: charName.trim(), characterClass: charClass, backstory, status: 'not_ready' }
          : p
      )
    )
    setCharSaved(true)
    setFormDirty(false)
    setIsReady(false)
  }

  function handleReady() {
    setIsReady(true)
    setPlayers(prev =>
      prev.map(p => (p?.isCurrentUser ? { ...p, status: 'ready' } : p))
    )
  }

  function handleEditCharacter() {
    setIsReady(false)
    setPlayers(prev =>
      prev.map(p => (p?.isCurrentUser ? { ...p, status: 'not_ready' } : p))
    )
  }

  function handleHostMarkReady(playerId: string) {
    setPlayers(prev =>
      prev.map(p => (p?.id === playerId ? { ...p, status: 'ready' } : p))
    )
  }

  return (
    <main className="relative min-h-screen overflow-hidden" style={{ background: 'var(--soot)' }}>
      {/* Atmosphere */}
      <EmberParticles count={15} />
      <AmbientSmoke />
      <GearDecoration />

      {/* Background image */}
      <div className="absolute inset-0 pointer-events-none">
        <img
          src="/images/lobby-bg.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-center"
          style={{ opacity: 0.35 }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        {/* Vignette */}
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse at 50% 100%, rgba(212,98,42,0.06) 0%, transparent 60%)',
        }} />
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(to bottom, rgba(13,12,10,0.6) 0%, rgba(13,12,10,0.2) 40%, rgba(13,12,10,0.7) 100%)',
        }} />
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(to right, rgba(13,12,10,0.1) 0%, rgba(13,12,10,0.5) 70%, rgba(13,12,10,0.85) 100%)',
        }} />
      </div>

      {/* ── Page Content ────────────────────────────────────────────── */}
      <div className="relative z-10 min-h-screen flex flex-col">

        {/* Main content */}
        <div className="flex-1 flex flex-col lg:flex-row gap-0 lg:gap-0">

          {/* ── LEFT: Roster ─────────────────────────────────────────── */}
          <div
            className="flex-1 overflow-y-auto px-6 py-10 lg:px-10 lg:py-12"
            style={{ maxHeight: '100vh' }}
          >
            {/* Page header */}
            <div className="mb-8 pt-2" style={{ animation: 'fadeInUp 0.5s ease-out both' }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="brass-nameplate text-xs">Lobby</div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--amber-glow)', animation: 'pulse 2s ease-in-out infinite' }} />
                  <span className="font-mono text-xs tracking-widest uppercase" style={{ color: 'var(--ash)' }}>
                    Assembling crew
                  </span>
                </div>
              </div>
              <h1 className="font-heading text-2xl lg:text-3xl tracking-widest uppercase mb-1" style={{ color: 'var(--steam)' }}>
                {MOCK_CAMPAIGN.name}
              </h1>
            </div>

            {/* Campaign blurb */}
            <div className="mb-8" style={{ animation: 'fadeInUp 0.55s ease-out 0.1s both' }}>
              <p className="text-sm leading-relaxed max-w-lg" style={{ color: 'var(--ash)' }}>
                {MOCK_CAMPAIGN.worldDescription}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <span className="font-mono text-xs" style={{ color: 'var(--gunmetal)' }}>Hosted by</span>
                <span className="font-mono text-xs" style={{ color: 'var(--brass)' }}>@{MOCK_CAMPAIGN.hostUsername}</span>
              </div>
            </div>

            {/* Section heading */}
            <div className="mb-6" style={{ animation: 'fadeInUp 0.55s ease-out 0.15s both' }}>
              <div className="flex items-center gap-4">
                <div className="i-beam flex-1" style={{ maxWidth: '32px' }} />
                <h2 className="font-heading text-xs tracking-[0.3em] uppercase" style={{ color: 'var(--ash)' }}>
                  Crew Manifest
                </h2>
                <div className="i-beam flex-1" />
                <span className="font-mono text-xs" style={{ color: 'var(--gunmetal)' }}>
                  {readyCount}/{filledPlayers.length} ready
                </span>
              </div>
            </div>

            {/* Roster */}
            <div className="flex flex-col gap-3 max-w-xl">
              {players.map((player, i) =>
                player === null ? (
                  <EmptySlot key={`empty-${i}`} index={i} />
                ) : (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    onMarkReady={isHost ? handleHostMarkReady : undefined}
                    isHost={isHost}
                  />
                )
              )}
            </div>

            {/* Host: Start Game */}
            {isHost && (
              <div
                className="mt-8 max-w-xl"
                style={{ animation: 'fadeInUp 0.6s ease-out 0.4s both' }}
              >
                <div className="brass-pipe mb-6" />
                <Button
                  className="w-full"
                  disabled={!allReady}
                  style={
                    allReady
                      ? {}
                      : { opacity: 0.4, cursor: 'not-allowed' }
                  }
                  title={allReady ? undefined : 'Waiting for all players to be ready'}
                >
                  Start Game
                </Button>
                {!allReady && (
                  <p className="mt-2 text-center text-xs" style={{ color: 'var(--gunmetal)' }}>
                    Waiting for all players to be ready
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT: Character Form ─────────────────────────────────── */}
          <div
            className="w-full lg:w-[380px] xl:w-[420px] flex-shrink-0 px-6 py-8 lg:px-8 lg:py-10 overflow-y-auto"
            style={{
              borderLeft: '1px solid rgba(61,54,48,0.4)',
              background: 'rgba(13,12,10,0.7)',
              backdropFilter: 'blur(8px)',
              maxHeight: '100vh',
              animation: 'fadeInUp 0.6s ease-out 0.2s both',
            }}
          >
            {/* Section heading */}
            <div className="mb-6">
              <div className="brass-nameplate text-xs mb-3">Your Character</div>
              <div className="brass-pipe w-12" />
            </div>

            {isReady ? (
              /* ── Ready State ── */
              <div className="gauge-panel p-6 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded flex items-center justify-center"
                    style={{ background: 'rgba(90,122,109,0.15)', border: '1px solid var(--patina)', color: 'var(--patina)' }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-heading text-sm tracking-widest uppercase" style={{ color: 'var(--patina)' }}>Ready</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>Waiting for others…</p>
                  </div>
                </div>

                <div className="pt-4 border-t" style={{ borderColor: 'rgba(61,54,48,0.4)' }}>
                  <p className="font-heading text-base tracking-wide" style={{ color: 'var(--steam)' }}>{charName}</p>
                  <p className="font-mono text-xs uppercase tracking-widest mt-1" style={{ color: 'var(--ash)' }}>{charClass}</p>
                  {backstory && (
                    <p className="text-sm mt-3 leading-relaxed" style={{ color: 'var(--ash)' }}>{backstory}</p>
                  )}
                </div>

                <button
                  onClick={handleEditCharacter}
                  className="text-xs font-heading tracking-widest uppercase underline underline-offset-4 text-left transition-colors duration-150"
                  style={{ color: 'var(--ash)', textDecorationColor: 'rgba(154,138,122,0.3)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--brass)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--ash)' }}
                >
                  Edit Character
                </button>
              </div>
            ) : (
              /* ── Edit Form ── */
              <form
                className="flex flex-col gap-5"
                onSubmit={e => { e.preventDefault(); saveCharacter() }}
              >
                {/* Character Name */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="char-name"
                    className="font-mono text-xs uppercase tracking-widest"
                    style={{ color: 'var(--brass)' }}
                  >
                    Character Name <span style={{ color: 'var(--furnace)' }}>*</span>
                  </label>
                  <input
                    id="char-name"
                    type="text"
                    value={charName}
                    onChange={e => { setCharName(e.target.value); setFormDirty(true); setCharSaved(false) }}
                    maxLength={40}
                    placeholder="Enter your character's name"
                    className="w-full px-3 py-2.5 text-sm transition-all duration-200 outline-none"
                    style={{
                      background: 'rgba(26,24,20,0.8)',
                      border: '1px solid var(--gunmetal)',
                      color: 'var(--steam)',
                      fontFamily: 'var(--font-body)',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--brass)'; e.target.style.boxShadow = '0 0 0 2px rgba(196,148,61,0.08)' }}
                    onBlur={e => { e.target.style.borderColor = 'var(--gunmetal)'; e.target.style.boxShadow = 'none' }}
                  />
                </div>

                {/* Class Picker */}
                <div className="flex flex-col gap-2">
                  <label className="font-mono text-xs uppercase tracking-widest" style={{ color: 'var(--brass)' }}>
                    Class <span style={{ color: 'var(--furnace)' }}>*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {CLASSES.map(cls => (
                      <ClassButton
                        key={cls}
                        cls={cls}
                        selected={charClass === cls}
                        onSelect={c => { setCharClass(c); setFormDirty(true); setCharSaved(false) }}
                      />
                    ))}
                  </div>
                </div>

                {/* Backstory */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="backstory"
                    className="font-mono text-xs uppercase tracking-widest"
                    style={{ color: 'var(--brass)' }}
                  >
                    Backstory
                    <span className="ml-2 normal-case" style={{ color: 'var(--ash)', letterSpacing: '0' }}>— optional</span>
                  </label>
                  <textarea
                    id="backstory"
                    value={backstory}
                    onChange={e => { setBackstory(e.target.value); setFormDirty(true) }}
                    maxLength={500}
                    rows={4}
                    placeholder="Who were you before this?"
                    className="w-full px-3 py-2.5 text-sm resize-none transition-all duration-200 outline-none leading-relaxed"
                    style={{
                      background: 'rgba(26,24,20,0.8)',
                      border: '1px solid var(--gunmetal)',
                      color: 'var(--steam)',
                      fontFamily: 'var(--font-body)',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--brass)'; e.target.style.boxShadow = '0 0 0 2px rgba(196,148,61,0.08)' }}
                    onBlur={e => { e.target.style.borderColor = 'var(--gunmetal)'; e.target.style.boxShadow = 'none' }}
                  />
                  <span className="text-right text-xs" style={{ color: 'var(--gunmetal)' }}>{backstory.length}/500</span>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2.5 pt-1">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!charName.trim() || !charClass}
                    variant={charSaved && !formDirty ? 'outline' : 'default'}
                  >
                    {charSaved && !formDirty ? 'Character Saved ✓' : 'Save Character'}
                  </Button>

                  {charSaved && !formDirty && (
                    <Button
                      type="button"
                      className="w-full"
                      onClick={handleReady}
                    >
                      I&apos;m Ready
                    </Button>
                  )}
                </div>

                {charSaved && !formDirty && (
                  <p className="text-xs text-center leading-relaxed" style={{ color: 'var(--gunmetal)' }}>
                    Click <span style={{ color: 'var(--ash)' }}>&ldquo;I&apos;m Ready&rdquo;</span> when you&apos;re set to go.
                  </p>
                )}
              </form>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
      `}</style>
    </main>
  )
}
