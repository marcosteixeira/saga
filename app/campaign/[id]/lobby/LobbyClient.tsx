'use client';

import { useState } from 'react';
import { EmberParticles } from '@/components/ember-particles';
import { AmbientSmoke } from '@/components/ambient-smoke';
import { GearDecoration } from '@/components/gear-decoration';
import { Button } from '@/components/ui/button';
import type { Campaign } from '@/types/campaign';
import type { Player as DBPlayer } from '@/types/player';
import type { World, WorldClass } from '@/types/world';

// ─── Types ────────────────────────────────────────────────────────────────────

type PlayerStatus = 'ready' | 'not_ready' | 'empty';

interface Player {
  id: string;
  username: string;
  characterName: string;
  characterClass: string;
  backstory: string;
  isHost: boolean;
  isCurrentUser: boolean;
  status: PlayerStatus;
}

interface LobbyClientProps {
  campaign: Campaign;
  world: World;
  players: DBPlayer[];
  currentUserId: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSection(content: string, heading: string): string {
  const lines = content.split('\n');
  const startIdx = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (startIdx === -1) return '';
  const out: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) break;
    out.push(lines[i]);
  }
  return out.join('\n').trim();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PlayerStatus }) {
  if (status === 'ready') {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-heading tracking-widest uppercase"
        style={{
          color: 'var(--patina)',
          border: '1px solid var(--patina)',
          background: 'rgba(90,122,109,0.12)'
        }}
      >
        <svg viewBox="0 0 10 10" fill="currentColor" className="w-2 h-2">
          <path
            d="M1.5 5.5 L4 8 L8.5 2.5"
            stroke="currentColor"
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Ready
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-heading tracking-widest uppercase"
      style={{
        color: 'var(--amber-glow)',
        border: '1px solid rgba(232,168,53,0.35)',
        background: 'rgba(232,168,53,0.08)'
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full inline-block"
        style={{
          background: 'var(--amber-glow)',
          animation: 'pulse 2s ease-in-out infinite'
        }}
      />
      Not Ready
    </span>
  );
}

function ClassInitial({ name }: { name: string }) {
  // Display the first letter of each word (up to 2) as a monogram
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <span
      className="font-heading text-xs leading-none"
      style={{ color: 'var(--brass)', letterSpacing: '0.05em' }}
    >
      {initials}
    </span>
  );
}

function PlayerCard({ player }: { player: Player }) {
  const isOwn = player.isCurrentUser;

  return (
    <div
      className="relative iron-plate p-4 flex items-start gap-4 transition-all duration-300"
      style={{
        borderColor:
          player.status === 'ready'
            ? 'rgba(196,148,61,0.5)'
            : isOwn
              ? 'rgba(196,148,61,0.25)'
              : 'var(--gunmetal)',
        boxShadow:
          player.status === 'ready'
            ? '0 0 20px rgba(196,148,61,0.08), inset 0 0 20px rgba(196,148,61,0.04)'
            : isOwn
              ? '0 0 12px rgba(196,148,61,0.04)'
              : 'none',
        animation: 'fadeInUp 0.5s ease-out both'
      }}
    >
      {/* Own card left accent */}
      {isOwn && (
        <div
          className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l"
          style={{
            background:
              'linear-gradient(to bottom, transparent, var(--brass), transparent)'
          }}
        />
      )}

      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div
          className="w-12 h-12 rounded flex items-center justify-center text-lg font-heading tracking-wider"
          style={{
            background: 'var(--smog)',
            border: '1px solid var(--gunmetal)',
            color: 'var(--ash)'
          }}
        >
          {player.characterName
            ? player.characterName.charAt(0).toUpperCase()
            : player.username.charAt(0).toUpperCase()}
        </div>
        {/* Class monogram badge */}
        <div
          className="absolute -bottom-1.5 -right-1.5 w-6 h-5 rounded-sm flex items-center justify-center"
          style={{ background: 'var(--iron)', border: '1px solid var(--gunmetal)' }}
        >
          <ClassInitial name={player.characterClass} />
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className="font-heading text-base tracking-wide"
            style={{ color: 'var(--steam)' }}
          >
            {player.characterName || (
              <span style={{ color: 'var(--ash)', fontStyle: 'italic' }}>
                No character yet
              </span>
            )}
          </span>
          {isOwn && (
            <span
              className="text-xs px-1.5 py-0.5 font-mono rounded"
              style={{
                background: 'rgba(196,148,61,0.12)',
                color: 'var(--brass)',
                border: '1px solid rgba(196,148,61,0.2)'
              }}
            >
              You
            </span>
          )}
          {player.isHost && (
            <span
              className="text-xs px-1.5 py-0.5 font-mono rounded"
              style={{
                background: 'rgba(90,122,109,0.12)',
                color: 'var(--patina)',
                border: '1px solid rgba(90,122,109,0.2)'
              }}
            >
              Host
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span
            className="font-mono text-xs uppercase tracking-widest"
            style={{ color: 'var(--ash)' }}
          >
            {player.characterClass}
          </span>
          <span className="text-sm" style={{ color: 'var(--gunmetal)' }}>
            ·
          </span>
          <span className="text-sm" style={{ color: 'var(--ash)' }}>
            @{player.characterName || player.username}
          </span>
        </div>
        <div className="mt-2">
          <StatusBadge status={player.status} />
        </div>
      </div>
    </div>
  );
}

function DraftPlayerCard({
  charName,
  charClass,
  username,
  isHost
}: {
  charName: string;
  charClass: string;
  username: string;
  isHost: boolean;
}) {
  const avatarLetter = charName
    ? charName.charAt(0).toUpperCase()
    : username.charAt(0).toUpperCase();

  return (
    <div
      className="relative p-4 flex items-start gap-4 transition-all duration-300"
      style={{
        border: '1px dashed rgba(196,148,61,0.25)',
        background: 'rgba(26,24,20,0.4)',
        animation: 'fadeInUp 0.5s ease-out both'
      }}
    >
      {/* Left accent */}
      <div
        className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l"
        style={{
          background:
            'linear-gradient(to bottom, transparent, rgba(196,148,61,0.35), transparent)'
        }}
      />

      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div
          className="w-12 h-12 rounded flex items-center justify-center text-lg font-heading tracking-wider"
          style={{
            background: 'var(--smog)',
            border: '1px dashed rgba(196,148,61,0.2)',
            color: 'var(--ash)',
            opacity: 0.7
          }}
        >
          {avatarLetter}
        </div>
        {charClass && (
          <div
            className="absolute -bottom-1.5 -right-1.5 w-6 h-5 rounded-sm flex items-center justify-center"
            style={{
              background: 'var(--iron)',
              border: '1px dashed rgba(196,148,61,0.2)'
            }}
          >
            <ClassInitial name={charClass} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className="font-heading text-sm tracking-wide"
            style={{
              color: charName ? 'var(--steam)' : 'var(--ash)',
              fontStyle: charName ? 'normal' : 'italic',
              opacity: charName ? 1 : 0.5
            }}
          >
            {charName || 'Unnamed'}
          </span>
          <span
            className="text-xs px-1.5 py-0 font-mono rounded"
            style={{
              background: 'rgba(196,148,61,0.12)',
              color: 'var(--brass)',
              border: '1px solid rgba(196,148,61,0.2)'
            }}
          >
            You
          </span>
          {isHost && (
            <span
              className="text-xs px-1.5 py-0 font-mono rounded"
              style={{
                background: 'rgba(90,122,109,0.12)',
                color: 'var(--patina)',
                border: '1px solid rgba(90,122,109,0.2)'
              }}
            >
              Host
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span
            className="font-mono text-xs uppercase tracking-widest"
            style={{
              color: charClass ? 'var(--ash)' : 'var(--gunmetal)',
              fontStyle: charClass ? 'normal' : 'italic'
            }}
          >
            {charClass || 'No class selected'}
          </span>
          <span className="text-xs" style={{ color: 'var(--gunmetal)' }}>
            ·
          </span>
          <span className="text-xs" style={{ color: 'var(--ash)' }}>
            @{charName || username}
          </span>
        </div>
        <div className="mt-2">
          {/* Building badge */}
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-heading tracking-widest uppercase"
            style={{
              color: 'rgba(196,148,61,0.5)',
              border: '1px dashed rgba(196,148,61,0.2)',
              background: 'transparent'
            }}
          >
            Building…
          </span>
        </div>
      </div>
    </div>
  );
}

function ClassCard({
  worldClass,
  selected,
  onSelect
}: {
  worldClass: WorldClass;
  selected: boolean;
  onSelect: (name: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(worldClass.name)}
      className="relative flex flex-col items-start gap-1.5 p-3 text-left transition-all duration-200"
      style={{
        border: selected ? '1px solid var(--brass)' : '1px solid var(--gunmetal)',
        background: selected ? 'rgba(196,148,61,0.07)' : 'rgba(26,24,20,0.5)',
        boxShadow: selected
          ? '0 0 14px rgba(196,148,61,0.1), inset 0 0 10px rgba(196,148,61,0.05)'
          : 'none'
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.borderColor = 'rgba(196,148,61,0.35)';
          e.currentTarget.style.background = 'rgba(26,24,20,0.7)';
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.borderColor = 'var(--gunmetal)';
          e.currentTarget.style.background = 'rgba(26,24,20,0.5)';
        }
      }}
    >
      {/* Selection dot */}
      {selected && (
        <span
          className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full"
          style={{ background: 'var(--brass)' }}
        />
      )}

      <span
        className="font-heading text-xs tracking-widest uppercase leading-none"
        style={{ color: selected ? 'var(--brass)' : 'var(--steam)' }}
      >
        {worldClass.name}
      </span>
      <span
        className="text-sm leading-relaxed"
        style={{ color: 'var(--ash)', opacity: selected ? 0.9 : 0.7 }}
      >
        {worldClass.description}
      </span>
    </button>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function LobbyClient({
  campaign,
  world,
  players: dbPlayers,
  currentUserId
}: LobbyClientProps) {
  const uiPlayers: Player[] = dbPlayers.map((p) => ({
    id: p.id,
    username: p.username,
    characterName: p.character_name ?? '',
    characterClass: p.character_class ?? '',
    backstory: p.character_backstory ?? '',
    isHost: p.is_host,
    isCurrentUser: p.user_id === currentUserId,
    status: (p.is_ready ? 'ready' : 'not_ready') as PlayerStatus
  }));

  const [players, setPlayers] = useState<Player[]>(uiPlayers);
  const currentUserFromDb = dbPlayers.find((p) => p.user_id === currentUserId)
  const [isReady, setIsReady] = useState(currentUserFromDb?.is_ready ?? false);

  // Own character form state
  const currentUser: Player | null = players.find((p) => p.isCurrentUser) ?? null;
  const [charName, setCharName] = useState(currentUser?.characterName ?? '');
  const [charClass, setCharClass] = useState<string>(currentUser?.characterClass ?? '');
  const [backstory, setBackstory] = useState(currentUser?.backstory ?? '');
  const [formDirty, setFormDirty] = useState(false);
  const [charSaved, setCharSaved] = useState(!!currentUser?.characterName);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [readying, setReadying] = useState(false);

  // Derived
  const readyCount = players.filter((p) => p.status === 'ready').length;
  const allReady = players.length > 0 && players.every((p) => p.status === 'ready');

  const isHost = currentUser?.isHost ?? false;

  async function saveCharacter() {
    if (!charName.trim() || !charClass) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/campaign/${campaign.id}/player`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_name: charName.trim(),
          character_class: charClass,
          character_backstory: backstory || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setSaveError(data.error ?? 'Failed to save character');
        return;
      }
      setPlayers((prev) =>
        prev.map((p) =>
          p.isCurrentUser
            ? { ...p, characterName: charName.trim(), characterClass: charClass, backstory }
            : p
        )
      );
      setCharSaved(true);
      setFormDirty(false);
      setIsReady(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleReady() {
    setReadying(true);
    try {
      const res = await fetch(`/api/campaign/${campaign.id}/ready`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_ready: true }),
      });
      if (!res.ok) return;
      setIsReady(true);
      setPlayers((prev) =>
        prev.map((p) => (p.isCurrentUser ? { ...p, status: 'ready' } : p))
      );
    } finally {
      setReadying(false);
    }
  }

  async function handleEditCharacter() {
    await fetch(`/api/campaign/${campaign.id}/ready`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_ready: false }),
    });
    setIsReady(false);
    setPlayers((prev) =>
      prev.map((p) => (p.isCurrentUser ? { ...p, status: 'not_ready' } : p))
    );
  }

  const selectedClassData = world.classes.find((c) => c.name === charClass);

  const worldName = parseSection(world.world_content ?? '', 'World Name');
  const worldOverview = parseSection(world.world_content ?? '', 'Overview');

  return (
    <main
      className="relative min-h-screen overflow-hidden"
      style={{ background: 'var(--soot)' }}
    >
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
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        {/* Vignette */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 100%, rgba(212,98,42,0.06) 0%, transparent 60%)'
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, rgba(13,12,10,0.6) 0%, rgba(13,12,10,0.2) 40%, rgba(13,12,10,0.7) 100%)'
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to right, rgba(13,12,10,0.1) 0%, rgba(13,12,10,0.5) 70%, rgba(13,12,10,0.85) 100%)'
          }}
        />
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
            <div
              className="mb-8 pt-2"
              style={{ animation: 'fadeInUp 0.5s ease-out both' }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="brass-nameplate text-xs">Lobby</div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: 'var(--amber-glow)',
                      animation: 'pulse 2s ease-in-out infinite'
                    }}
                  />
                  <span
                    className="font-mono text-sm tracking-widest uppercase"
                    style={{ color: 'var(--ash)' }}
                  >
                    Assembling party
                  </span>
                </div>
              </div>
              <h1
                className="font-heading text-3xl lg:text-4xl xl:text-5xl tracking-widest uppercase mb-1"
                style={{ color: 'var(--steam)' }}
              >
                {campaign.name}
              </h1>
            </div>

            {/* World lore blurb */}
            <div
              className="mb-8"
              style={{ animation: 'fadeInUp 0.55s ease-out 0.1s both' }}
            >
              {worldName && (
                <p
                  className="font-heading text-sm tracking-[0.25em] uppercase mb-3"
                  style={{ color: 'var(--brass)', opacity: 0.7 }}
                >
                  {worldName}
                </p>
              )}
              {worldOverview && (
                <p
                  className="text-base leading-relaxed max-w-2xl"
                  style={{ color: 'var(--ash)' }}
                >
                  {worldOverview}
                </p>
              )}
              <div className="mt-4 flex items-center gap-2">
                <span className="font-mono text-sm" style={{ color: 'var(--gunmetal)' }}>
                  Hosted by
                </span>
                <span className="font-mono text-sm" style={{ color: 'var(--brass)' }}>
                  @{campaign.host_username}
                </span>
              </div>
            </div>

            {/* Section heading */}
            <div
              className="mb-6"
              style={{ animation: 'fadeInUp 0.55s ease-out 0.15s both' }}
            >
              <div className="flex items-center gap-4">
                <div className="i-beam flex-1" style={{ maxWidth: '32px' }} />
                <h2
                  className="font-heading text-sm tracking-[0.3em] uppercase"
                  style={{ color: 'var(--ash)' }}
                >
                  Party Manifest
                </h2>
                <div className="i-beam flex-1" />
                <span className="font-mono text-sm" style={{ color: 'var(--gunmetal)' }}>
                  {readyCount}/{players.length} ready
                </span>
              </div>
            </div>

            {/* Roster */}
            <div className="flex flex-col gap-3 max-w-xl">
              {players.map((player) => (
                <PlayerCard key={player.id} player={player} />
              ))}
              {players.length === 0 && (
                <DraftPlayerCard
                  charName={charName}
                  charClass={charClass}
                  username={currentUser?.username ?? campaign.host_username}
                  isHost={isHost}
                />
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
                  style={allReady ? {} : { opacity: 0.4, cursor: 'not-allowed' }}
                  title={allReady ? undefined : 'Waiting for all players to be ready'}
                >
                  Start Game
                </Button>
                {!allReady && (
                  <p
                    className="mt-2 text-center text-sm"
                    style={{ color: 'var(--gunmetal)' }}
                  >
                    Waiting for all players to be ready
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT: Character Form ─────────────────────────────────── */}
          <div
            className="w-full lg:w-[460px] xl:w-[500px] flex-shrink-0 px-6 py-8 lg:px-8 lg:py-10 overflow-y-auto"
            style={{
              borderLeft: '1px solid rgba(61,54,48,0.4)',
              background: 'rgba(13,12,10,0.7)',
              backdropFilter: 'blur(8px)',
              maxHeight: '100vh',
              animation: 'fadeInUp 0.6s ease-out 0.2s both'
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
                    style={{
                      background: 'rgba(90,122,109,0.15)',
                      border: '1px solid var(--patina)',
                      color: 'var(--patina)'
                    }}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      className="w-5 h-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m5 13 4 4L19 7"
                      />
                    </svg>
                  </div>
                  <div>
                    <p
                      className="font-heading text-sm tracking-widest uppercase"
                      style={{ color: 'var(--patina)' }}
                    >
                      Ready
                    </p>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
                      Waiting for others…
                    </p>
                  </div>
                </div>

                <div
                  className="pt-4 border-t"
                  style={{ borderColor: 'rgba(61,54,48,0.4)' }}
                >
                  <p
                    className="font-heading text-base tracking-wide"
                    style={{ color: 'var(--steam)' }}
                  >
                    {charName}
                  </p>
                  <p
                    className="font-mono text-xs uppercase tracking-widest mt-1"
                    style={{ color: 'var(--brass)' }}
                  >
                    {charClass}
                  </p>
                  {selectedClassData && (
                    <p
                      className="text-sm mt-1 leading-relaxed"
                      style={{ color: 'var(--ash)', opacity: 0.7 }}
                    >
                      {selectedClassData.description}
                    </p>
                  )}
                  {backstory && (
                    <p
                      className="text-base mt-3 leading-relaxed"
                      style={{ color: 'var(--ash)' }}
                    >
                      {backstory}
                    </p>
                  )}
                </div>

                <button
                  onClick={handleEditCharacter}
                  className="text-xs font-heading tracking-widest uppercase underline underline-offset-4 text-left transition-colors duration-150"
                  style={{
                    color: 'var(--ash)',
                    textDecorationColor: 'rgba(154,138,122,0.3)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--brass)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--ash)';
                  }}
                >
                  Edit Character
                </button>
              </div>
            ) : (
              /* ── Edit Form ── */
              <form
                className="flex flex-col gap-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveCharacter();
                }}
              >
                {/* Character Name */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="char-name"
                    className="font-mono text-sm uppercase tracking-widest"
                    style={{ color: 'var(--brass)' }}
                  >
                    Character Name <span style={{ color: 'var(--furnace)' }}>*</span>
                  </label>
                  <input
                    id="char-name"
                    type="text"
                    value={charName}
                    onChange={(e) => {
                      setCharName(e.target.value);
                      setFormDirty(true);
                      setCharSaved(false);
                    }}
                    maxLength={40}
                    placeholder="Enter your character's name"
                    className="w-full px-3 py-3 text-base transition-all duration-200 outline-none"
                    style={{
                      background: 'rgba(26,24,20,0.8)',
                      border: '1px solid var(--gunmetal)',
                      color: 'var(--steam)',
                      fontFamily: 'var(--font-body)'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = 'var(--brass)';
                      e.target.style.boxShadow = '0 0 0 2px rgba(196,148,61,0.08)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'var(--gunmetal)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>

                {/* Class Picker — world-specific cards with descriptions */}
                <div className="flex flex-col gap-2">
                  <label
                    className="font-mono text-sm uppercase tracking-widest"
                    style={{ color: 'var(--brass)' }}
                  >
                    Class <span style={{ color: 'var(--furnace)' }}>*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {world.classes.map((worldClass) => (
                      <ClassCard
                        key={worldClass.name}
                        worldClass={worldClass}
                        selected={charClass === worldClass.name}
                        onSelect={(name) => {
                          setCharClass(name);
                          setFormDirty(true);
                          setCharSaved(false);
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Backstory */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="backstory"
                    className="font-mono text-sm uppercase tracking-widest"
                    style={{ color: 'var(--brass)' }}
                  >
                    Backstory
                    <span
                      className="ml-2 normal-case"
                      style={{ color: 'var(--ash)', letterSpacing: '0' }}
                    >
                      — optional
                    </span>
                  </label>
                  <textarea
                    id="backstory"
                    value={backstory}
                    onChange={(e) => {
                      setBackstory(e.target.value);
                      setFormDirty(true);
                    }}
                    maxLength={500}
                    rows={4}
                    placeholder="Who were you before this?"
                    className="w-full px-3 py-3 text-base resize-none transition-all duration-200 outline-none leading-relaxed"
                    style={{
                      background: 'rgba(26,24,20,0.8)',
                      border: '1px solid var(--gunmetal)',
                      color: 'var(--steam)',
                      fontFamily: 'var(--font-body)'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = 'var(--brass)';
                      e.target.style.boxShadow = '0 0 0 2px rgba(196,148,61,0.08)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'var(--gunmetal)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                  <span
                    className="text-right text-xs"
                    style={{ color: 'var(--gunmetal)' }}
                  >
                    {backstory.length}/500
                  </span>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2.5 pt-1">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!charName.trim() || !charClass || saving}
                    variant={charSaved && !formDirty ? 'outline' : 'default'}
                  >
                    {saving ? 'Saving…' : charSaved && !formDirty ? 'Character Saved ✓' : 'Save Character'}
                  </Button>

                  {charSaved && !formDirty && (
                    <Button type="button" className="w-full" onClick={handleReady} disabled={readying}>
                      {readying ? 'Updating…' : "I'm Ready"}
                    </Button>
                  )}
                </div>
                {saveError && (
                  <p className="text-xs text-center" style={{ color: 'var(--furnace)' }}>
                    {saveError}
                  </p>
                )}

                {charSaved && !formDirty && (
                  <p
                    className="text-xs text-center leading-relaxed"
                    style={{ color: 'var(--gunmetal)' }}
                  >
                    Click{' '}
                    <span style={{ color: 'var(--ash)' }}>
                      &ldquo;I&apos;m Ready&rdquo;
                    </span>{' '}
                    when you&apos;re set to go.
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
  );
}
