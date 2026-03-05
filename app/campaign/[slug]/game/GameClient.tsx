'use client';

import { useState, useEffect, useRef } from 'react';
import { EmberParticles } from '@/components/ember-particles';
import { AmbientSmoke } from '@/components/ambient-smoke';
import { GearDecoration } from '@/components/gear-decoration';
import { ImageModal, type ImageModalState } from './components/ImageModal';
import { MessageBubble } from './components/MessageBubble';
import { MobileActionBar } from './components/MobileActionBar';
import type { Campaign } from '@/types/campaign';
import type { Player } from '@/types/player';
import type { World } from '@/types/world';
import type { Message } from '@/types/message';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GameClientProps {
  campaign: Campaign;
  world: World;
  players: Player[];
  messages: Message[];
  currentUserId: string;
}

type GameViewState = 'loading' | 'active' | 'image-reveal';
type MobilePanel = null | 'crew' | 'log';

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_MESSAGES: Message[] = [
  {
    id: '6',
    campaign_id: 'c1',
    session_id: 's1',
    player_id: null,
    content: 'Session started. Campaign mode: Free Play. Turn timer disabled.',
    image_url: null,
    type: 'system',
    created_at: new Date(Date.now() - 360000).toISOString(),
  },
  {
    id: '1',
    campaign_id: 'c1',
    session_id: 's1',
    player_id: null,
    content:
      'The airship *Ironclad Meridian* shudders as it pierces through a low-hanging cloudbank above the smog-choked sprawl of Gearfordshire. Through streaked portholes, you can see the city below — a labyrinth of copper pipes, towering smokestacks, and gas-lamp streets. Your destination: the Foundry District, where the Brass Consortium keeps its most dangerous secrets.',
    image_url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1600&q=85',
    type: 'narration',
    created_at: new Date(Date.now() - 300000).toISOString(),
  },
  {
    id: '2',
    campaign_id: 'c1',
    session_id: 's1',
    player_id: 'p1',
    content: 'I pull out my compass and check our bearing. "How much time before we dock at the Meridian Tower?"',
    image_url: null,
    type: 'action',
    created_at: new Date(Date.now() - 240000).toISOString(),
  },
  {
    id: '3',
    campaign_id: 'c1',
    session_id: 's1',
    player_id: null,
    content:
      'The compass needle spins lazily — the aetherite interference from the district\'s power cores makes navigation unreliable here. Captain Mira calls back from the helm: *"Fifteen minutes, give or take. And pray the Corsair Guild isn\'t running checkpoints today."* A low rumble shakes the hull as a rival vessel passes uncomfortably close.',
    image_url: null,
    type: 'narration',
    created_at: new Date(Date.now() - 180000).toISOString(),
  },
  {
    id: '4',
    campaign_id: 'c1',
    session_id: 's1',
    player_id: 'p2',
    content: 'I move to the starboard side and peer through my spyglass at the rival vessel. Can I make out their markings?',
    image_url: null,
    type: 'action',
    created_at: new Date(Date.now() - 120000).toISOString(),
  },
  {
    id: '5',
    campaign_id: 'c1',
    session_id: 's1',
    player_id: null,
    content:
      'Roll Perception. The spyglass reveals a black hull with a serpent-and-gear sigil — the **Iron Serpent Company**, private enforcers for the Brass Consortium. They haven\'t spotted you yet, but they\'re running dark: no running lights, no registry beacon. Whatever they\'re doing out here isn\'t official business.',
    image_url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&q=80',
    type: 'narration',
    created_at: new Date(Date.now() - 60000).toISOString(),
  },
];

const MOCK_PLAYERS: Player[] = [
  {
    id: 'p1',
    campaign_id: 'c1',
    user_id: 'u1',
    username: 'Ironforge',
    character_name: 'Vex Ashbury',
    character_class: 'Artificer',
    character_backstory: 'Former guild engineer turned rogue inventor.',
    character_image_url: null,
    stats: { hp: 18, hp_max: 20 },
    status: 'active',
    absence_mode: 'skip',
    is_host: true,
    is_ready: true,
    last_seen_at: new Date().toISOString(),
    joined_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'p2',
    campaign_id: 'c1',
    user_id: 'u2',
    username: 'SkyWarden',
    character_name: 'Lyra Copperfield',
    character_class: 'Scout',
    character_backstory: 'Ex-corsair pilot who now hunts her former crew.',
    character_image_url: null,
    stats: { hp: 12, hp_max: 20 },
    status: 'active',
    absence_mode: 'skip',
    is_host: false,
    is_ready: true,
    last_seen_at: new Date().toISOString(),
    joined_at: new Date(Date.now() - 3500000).toISOString(),
  },
  {
    id: 'p3',
    campaign_id: 'c1',
    user_id: 'u3',
    username: 'GrimCoil',
    character_name: 'Barnabas Grime',
    character_class: 'Brawler',
    character_backstory: 'Retired prizefighter from the Soot Pits.',
    character_image_url: null,
    stats: { hp: 5, hp_max: 20 },
    status: 'active',
    absence_mode: 'skip',
    is_host: false,
    is_ready: true,
    last_seen_at: new Date(Date.now() - 120000).toISOString(),
    joined_at: new Date(Date.now() - 3400000).toISOString(),
  },
];

// ─── Loading State ─────────────────────────────────────────────────────────────

function LoadingState({ campaignName, backgroundImageUrl }: { campaignName: string; backgroundImageUrl?: string }) {
  const [phase, setPhase] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const phases = [
    'Calibrating narrative engines...',
    'Loading world memory...',
    'Synchronizing player manifests...',
    'Igniting the furnace...',
    'Campaign ready — standing by',
  ];

  useEffect(() => {
    if (phase >= phases.length - 1) return;
    const t = setTimeout(() => setPhase((p) => p + 1), 1200);
    return () => clearTimeout(t);
  }, [phase, phases.length]);

  const hasImage = !!backgroundImageUrl;

  return (
    <div className="relative flex h-[100dvh] min-h-screen flex-col overflow-hidden bg-soot">

      {/* ── Cinematic background (when image available) ── */}
      {hasImage && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={backgroundImageUrl}
            alt=""
            onLoad={() => setImgLoaded(true)}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-1000"
            style={{ opacity: imgLoaded ? 0.62 : 0, filter: 'saturate(0.75) brightness(0.55)' }}
          />
          {/* Top fade — sky bleeds into soot */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3" style={{ background: 'linear-gradient(180deg, var(--soot) 0%, transparent 100%)' }} />
          {/* Bottom scrim — reinforces the built-in vignette from the prompt */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5" style={{ background: 'linear-gradient(0deg, var(--soot) 0%, rgba(13,12,10,0.85) 40%, transparent 100%)' }} />
          {/* Warm furnace underglow */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 100%, rgba(212,98,42,0.12) 0%, transparent 70%)' }} />
        </>
      )}

      {/* Atmospheric layers (always) */}
      <EmberParticles count={hasImage ? 20 : 15} />
      <div className="furnace-overlay" style={{ opacity: hasImage ? 0.3 : 1 }} />
      {!hasImage && <GearDecoration />}
      {!hasImage && <AmbientSmoke />}
      <div className="vignette" />

      {hasImage ? (
        /* ── IMAGE MODE: title top, chrome bottom ───────────────────── */
        <>
          {/* Campaign title — upper portion, over sky */}
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center" style={{ paddingTop: '8vh' }}>
            <div
              className="mb-4 text-[10px] uppercase tracking-[0.4em] text-brass/80"
              style={{ fontFamily: 'var(--font-mono), monospace' }}
            >
              ── Campaign ──
            </div>
            <h1
              className="text-[clamp(2.5rem,8vw,6rem)] uppercase leading-none tracking-[0.1em] text-steam"
              style={{
                fontFamily: 'var(--font-display), sans-serif',
                textShadow: '0 2px 40px rgba(13,12,10,0.9), 0 0 80px rgba(196,148,61,0.25)',
              }}
            >
              {campaignName}
            </h1>
          </div>

          {/* Loading chrome — anchored to bottom vignette */}
          <div className="relative z-10 flex flex-col items-center gap-4 px-6 pb-12 sm:pb-16">
            {/* Status */}
            <div
              className="min-h-[1.25rem] text-[10px] uppercase tracking-[0.25em] text-amber/70 sm:text-xs"
              style={{ fontFamily: 'var(--font-mono), monospace' }}
            >
              {phases[phase]}
            </div>

            {/* Progress bar */}
            <div className="relative h-[3px] w-48 overflow-hidden sm:w-64" style={{ background: 'rgba(61,54,48,0.8)' }}>
              <div
                className="absolute inset-y-0 left-0 transition-all duration-700"
                style={{
                  width: `${((phase + 1) / phases.length) * 100}%`,
                  background: 'linear-gradient(90deg, var(--copper), var(--brass), var(--amber))',
                  boxShadow: '0 0 8px rgba(232,168,53,0.8)',
                }}
              />
              {/* Rivet joints */}
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="absolute top-1/2 h-[5px] w-[5px] -translate-y-1/2 rounded-full"
                  style={{ left: `${(i + 1) * 20}%`, background: 'var(--gunmetal)', border: '1px solid var(--smog)' }}
                />
              ))}
            </div>

            {/* Phase indicators */}
            <div className="flex items-center gap-2">
              {phases.map((_, i) => (
                <div
                  key={i}
                  className="h-1 rounded-full transition-all duration-500"
                  style={{
                    width: i === phase ? '16px' : '4px',
                    background: i <= phase ? 'var(--brass)' : 'var(--gunmetal)',
                    boxShadow: i === phase ? '0 0 6px var(--amber)' : 'none',
                  }}
                />
              ))}
            </div>
          </div>
        </>
      ) : (
        /* ── FALLBACK MODE: centered piston loader ───────────────────── */
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-6 text-center sm:gap-10">
          <div className="relative flex h-20 items-center gap-1 sm:h-24">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="relative flex flex-col items-center">
                <div
                  className="w-3 rounded-sm bg-gradient-to-b from-brass via-copper to-gunmetal"
                  style={{ height: '3.5rem', animation: `pistonPump 0.8s ease-in-out infinite`, animationDelay: `${i * 0.16}s`, boxShadow: '0 0 8px rgba(196,148,61,0.4)' }}
                />
                <div className="h-3 w-5 rounded-sm bg-brass" style={{ boxShadow: '0 2px 8px rgba(196,148,61,0.5)' }} />
              </div>
            ))}
            <div className="absolute bottom-0 h-2 w-full rounded-sm" style={{ background: 'linear-gradient(90deg, var(--gunmetal), var(--copper), var(--gunmetal))' }} />
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="text-xs uppercase tracking-[0.3em] text-ash" style={{ fontFamily: 'var(--font-mono), monospace' }}>Loading Campaign</div>
            <h1 className="text-3xl uppercase tracking-[0.12em] text-brass sm:text-4xl" style={{ fontFamily: 'var(--font-display), sans-serif', textShadow: '0 0 40px rgba(196,148,61,0.4)' }}>
              {campaignName}
            </h1>
          </div>

          <div className="min-h-[2rem] px-4 text-xs uppercase tracking-[0.2em] text-amber/80 sm:text-sm" style={{ fontFamily: 'var(--font-mono), monospace' }}>
            {phases[phase]}
          </div>

          <div className="relative h-2 w-56 overflow-hidden rounded-sm border border-gunmetal bg-iron sm:w-64">
            <div className="absolute inset-y-0 left-0 transition-all duration-700" style={{ width: `${((phase + 1) / phases.length) * 100}%`, background: 'linear-gradient(90deg, var(--copper), var(--brass), var(--amber))', boxShadow: '0 0 12px rgba(232,168,53,0.6)' }} />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-gunmetal" style={{ left: `${(i + 1) * 20}%` }} />
            ))}
          </div>

          <div className="flex gap-6 sm:gap-8">
            {['World', 'Players', 'AI GM'].map((label, i) => (
              <div key={label} className="flex flex-col items-center gap-2">
                <div className="pressure-gauge !h-10 !w-10 !border sm:!h-12 sm:!w-12"
                  style={{ borderColor: phase > i ? 'var(--brass)' : 'var(--gunmetal)', boxShadow: phase > i ? '0 0 12px rgba(196,148,61,0.3)' : 'none', transition: 'all 0.5s' }}>
                  <span className="text-[10px] font-bold sm:text-xs" style={{ color: phase > i ? 'var(--amber)' : 'var(--ash)', fontFamily: 'var(--font-mono), monospace', transition: 'color 0.5s' }}>
                    {phase > i ? 'OK' : '--'}
                  </span>
                </div>
                <span className="text-[9px] uppercase tracking-[0.15em] text-ash sm:text-[10px]" style={{ fontFamily: 'var(--font-mono), monospace' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pistonPump {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-16px); }
        }
      `}</style>
    </div>
  );
}

// ─── HP Bar ───────────────────────────────────────────────────────────────────

function HpBar({ hp, hpMax }: { hp: number; hpMax: number }) {
  const pct = Math.max(0, Math.min(100, (hp / hpMax) * 100));
  const color = pct > 60 ? 'var(--patina)' : pct > 25 ? 'var(--amber)' : 'var(--furnace)';
  return (
    <div className="relative h-1.5 w-full overflow-hidden border border-gunmetal/60 bg-iron">
      <div className="absolute inset-y-0 left-0 transition-all duration-500" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}66` }} />
    </div>
  );
}

// ─── Player Card ──────────────────────────────────────────────────────────────

function PlayerCard({ player, isCurrentUser, compact = false }: { player: Player; isCurrentUser: boolean; compact?: boolean }) {
  const isLowHp = player.stats.hp / player.stats.hp_max < 0.25;
  return (
    <div className={`iron-plate relative flex flex-col gap-2 p-3 transition-all duration-300 ${isCurrentUser ? 'ring-1 ring-brass/40' : ''} ${isLowHp ? 'ring-1 ring-furnace/50' : ''}`}>
      <div className="flex items-center gap-3">
        <div
          className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-gunmetal bg-smog ${compact ? 'h-9 w-9' : 'h-11 w-11'}`}
          style={{ clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)' }}
        >
          {player.character_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={player.character_image_url} alt={player.character_name ?? ''} className="h-full w-full object-cover" />
          ) : (
            <span className="font-bold text-ash" style={{ fontSize: compact ? '0.875rem' : '1rem', fontFamily: 'var(--font-display), sans-serif' }}>
              {(player.character_name ?? player.username)[0].toUpperCase()}
            </span>
          )}
          {player.is_host && (
            <div className="absolute right-0 top-0 flex h-3 w-3 items-center justify-center bg-brass">
              <span className="text-[6px] font-bold text-soot">H</span>
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-steam" style={{ fontFamily: 'var(--font-heading), serif' }}>
            {player.character_name ?? player.username}
          </span>
          <span className="truncate text-[10px] uppercase tracking-[0.12em] text-copper" style={{ fontFamily: 'var(--font-mono), monospace' }}>
            {player.character_class ?? 'Unknown'}
          </span>
        </div>
        <span className="shrink-0 text-[10px] text-ash/70" style={{ fontFamily: 'var(--font-mono), monospace' }}>
          {player.stats.hp}/{player.stats.hp_max}
        </span>
      </div>
      <HpBar hp={player.stats.hp} hpMax={player.stats.hp_max} />
      <div className="absolute right-2 top-2">
        <div className="h-1.5 w-1.5 rounded-full" style={{ background: player.status === 'active' ? 'var(--patina)' : 'var(--ash)', boxShadow: player.status === 'active' ? '0 0 4px var(--patina)' : 'none' }} />
      </div>
    </div>
  );
}

// ─── Mobile Slide Panel ────────────────────────────────────────────────────────

function MobilePanel({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div
        className="fixed inset-0 z-30 lg:hidden"
        style={{ background: 'rgba(13,12,10,0.7)', opacity: open ? 1 : 0, pointerEvents: open ? 'all' : 'none', transition: 'opacity 0.3s', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />
      <div
        className="fixed inset-x-0 bottom-0 z-40 flex max-h-[80vh] flex-col border-t border-gunmetal bg-iron/95 lg:hidden"
        style={{ transform: open ? 'translateY(0)' : 'translateY(100%)', transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1)', backdropFilter: 'blur(8px)', paddingBottom: '112px' }}
      >
        <div className="flex justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-gunmetal" />
        </div>
        <div className="flex items-center justify-between border-b border-gunmetal px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-px w-6 bg-gradient-to-r from-brass/40 to-transparent" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-brass" style={{ fontFamily: 'var(--font-mono), monospace' }}>{title}</span>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center border border-gunmetal/60 text-ash/60 transition-colors hover:border-copper hover:text-copper"
            style={{ clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)' }}
          >
            <span className="text-sm leading-none">✕</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </>
  );
}

// ─── Mobile Tab Bar ────────────────────────────────────────────────────────────

function MobileTabBar({ mobilePanel, onPanelToggle, playerCount }: { mobilePanel: MobilePanel; onPanelToggle: (panel: MobilePanel) => void; playerCount: number }) {
  const tabs = [
    {
      id: 'crew' as const,
      label: 'Crew',
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 15c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: 'log' as const,
      label: 'World',
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M2.5 9h13M9 2.5c-2 2-3 4-3 6.5s1 4.5 3 6.5M9 2.5c2 2 3 4 3 6.5s-1 4.5-3 6.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      ),
    },
  ];

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex h-14 items-stretch border-t border-gunmetal bg-iron/95 lg:hidden" style={{ backdropFilter: 'blur(8px)' }}>
      <button
        className="flex flex-1 flex-col items-center justify-center gap-1 transition-colors"
        onClick={() => onPanelToggle(null)}
        style={{ color: mobilePanel === null ? 'var(--brass)' : 'var(--ash)' }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M3 4h12M3 8h12M3 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="text-[9px] uppercase tracking-[0.12em]" style={{ fontFamily: 'var(--font-mono), monospace' }}>Chronicle</span>
      </button>
      <div className="my-3 w-px bg-gunmetal/60" />
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className="relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors"
          onClick={() => onPanelToggle(mobilePanel === tab.id ? null : tab.id)}
          style={{ color: mobilePanel === tab.id ? 'var(--brass)' : 'var(--ash)' }}
        >
          {tab.icon}
          <span className="text-[9px] uppercase tracking-[0.12em]" style={{ fontFamily: 'var(--font-mono), monospace' }}>{tab.label}</span>
          {mobilePanel === tab.id && (
            <div className="absolute inset-x-4 top-0 h-0.5 bg-brass" style={{ boxShadow: '0 0 6px var(--brass)' }} />
          )}
          {tab.id === 'crew' && playerCount > 0 && (
            <div
              className="absolute right-3 top-2 flex h-4 w-4 items-center justify-center bg-brass text-[9px] font-bold text-soot"
              style={{ clipPath: 'polygon(2px 0, 100% 0, 100% calc(100% - 2px), calc(100% - 2px) 100%, 0 100%, 0 2px)' }}
            >
              {playerCount}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Gallery Thumbnail ─────────────────────────────────────────────────────────

function GalleryThumb({ imageUrl, onClick }: { imageUrl: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative aspect-square w-full overflow-hidden border border-gunmetal/60 transition-all duration-200 hover:border-brass/60"
      style={{ clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
      <div className="absolute inset-0 flex items-center justify-center bg-soot/0 transition-colors duration-200 group-hover:bg-soot/30">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <path d="M1.5 12.5L12.5 1.5M12.5 1.5H6M12.5 1.5V8" stroke="var(--brass)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </button>
  );
}

// ─── Desktop Left Sidebar ─────────────────────────────────────────────────────

function DesktopLeftSidebar({ campaign, players, currentUserId }: { campaign: Campaign; players: Player[]; currentUserId: string }) {
  return (
    <aside className="relative z-10 hidden w-56 shrink-0 flex-col border-r border-gunmetal bg-iron/80 lg:flex" style={{ backdropFilter: 'blur(4px)' }}>
      <div className="border-b border-gunmetal px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-gradient-to-r from-brass/40 to-transparent" />
          <span className="text-[10px] uppercase tracking-[0.25em] text-brass" style={{ fontFamily: 'var(--font-mono), monospace' }}>Party</span>
          <div className="h-px flex-1 bg-gradient-to-l from-brass/40 to-transparent" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        {players.map((player) => (
          <PlayerCard key={player.id} player={player} isCurrentUser={player.user_id === currentUserId} compact />
        ))}
      </div>
      <div className="border-t border-gunmetal px-4 py-3">
        <div className="flex flex-col gap-1.5">
          {[
            { label: 'Mode', value: campaign.turn_mode, color: 'var(--copper)' },
            { label: 'Status', value: 'Live', color: 'var(--patina)', dot: true },
          ].map(({ label, value, color, dot }) => (
            <div key={label} className="flex justify-between">
              <span className="text-[9px] uppercase tracking-[0.1em] text-ash/60" style={{ fontFamily: 'var(--font-mono), monospace' }}>{label}</span>
              <div className="flex items-center gap-1">
                {dot && <div className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />}
                <span className="text-[9px] uppercase" style={{ color, fontFamily: 'var(--font-mono), monospace' }}>{value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

// ─── Desktop Right Sidebar ────────────────────────────────────────────────────

function DesktopRightSidebar({ world, messages, onImageClick }: { world: World; messages: Message[]; onImageClick: (state: ImageModalState) => void }) {
  const galleryImages = messages.filter((m) => m.image_url);

  return (
    <aside className="relative z-10 hidden w-56 shrink-0 flex-col border-l border-gunmetal bg-iron/80 lg:flex" style={{ backdropFilter: 'blur(4px)' }}>
      {/* World image — clickable */}
      <button
        onClick={() => world.cover_image_url && onImageClick({ url: world.cover_image_url, caption: world.name })}
        className="group relative overflow-hidden border-b border-gunmetal"
        style={{ cursor: world.cover_image_url ? 'pointer' : 'default' }}
      >
        {world.cover_image_url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={world.cover_image_url} alt={world.name} className="h-32 w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
            <div className="absolute inset-0 flex items-center justify-center bg-soot/0 transition-colors duration-300 group-hover:bg-soot/20">
              <div className="flex items-center gap-1.5 border border-brass/60 bg-soot/80 px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                style={{ clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)', backdropFilter: 'blur(4px)' }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1 9L9 1M9 1H4M9 1V6" stroke="var(--brass)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[9px] uppercase tracking-[0.15em] text-brass" style={{ fontFamily: 'var(--font-mono), monospace' }}>Expand</span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-32 items-center justify-center bg-smog/60">
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl text-gunmetal" style={{ fontFamily: 'var(--font-display), sans-serif' }}>MAP</span>
              <span className="text-[9px] uppercase tracking-[0.2em] text-ash/40" style={{ fontFamily: 'var(--font-mono), monospace' }}>Generating...</span>
            </div>
          </div>
        )}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(0deg, var(--iron) 0%, transparent 60%)' }} />
        <div className="absolute bottom-2 left-3">
          <span className="text-xs font-bold uppercase tracking-[0.08em] text-steam" style={{ fontFamily: 'var(--font-display), sans-serif', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
            {world.name}
          </span>
        </div>
      </button>

      {/* Gallery */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-gradient-to-r from-copper/30 to-transparent" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-copper/70" style={{ fontFamily: 'var(--font-mono), monospace' }}>Gallery</span>
        </div>
        {galleryImages.length === 0 ? (
          <p className="text-[9px] uppercase tracking-[0.1em] text-ash/30" style={{ fontFamily: 'var(--font-mono), monospace' }}>No visions recorded yet</p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {galleryImages.slice(-6).reverse().map((m) => (
              <GalleryThumb key={m.id} imageUrl={m.image_url!} onClick={() => onImageClick({ url: m.image_url! })} />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Desktop Action Console ────────────────────────────────────────────────────

function DesktopActionConsole({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="hidden border-t border-gunmetal bg-iron/70 px-6 py-4 lg:block" style={{ backdropFilter: 'blur(4px)' }}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-px w-6 bg-gradient-to-r from-transparent to-copper/60" />
          <span className="text-[9px] uppercase tracking-[0.25em] text-copper/70" style={{ fontFamily: 'var(--font-mono), monospace' }}>Action Console</span>
        </div>
        <div className="flex gap-3">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Describe your action or speak in character..."
            rows={2}
            className="flex-1 resize-none bg-smog/80 px-4 py-3 text-sm text-steam/90 placeholder:text-ash/40 focus:outline-none"
            style={{
              fontFamily: 'var(--font-body), sans-serif',
              border: '1px solid var(--gunmetal)',
              clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--brass)'; e.target.style.boxShadow = '0 0 0 1px rgba(196,148,61,0.2), inset 0 0 20px rgba(196,148,61,0.04)'; }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--gunmetal)'; e.target.style.boxShadow = 'none'; }}
          />
          <button
            className="flex shrink-0 flex-col items-center justify-center gap-1 px-6 py-3 text-soot transition-all duration-300 hover:shadow-[0_0_20px_rgba(196,148,61,0.4)] active:scale-[0.97]"
            style={{
              background: 'linear-gradient(135deg, var(--copper), var(--brass), var(--copper))',
              clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            <span className="text-xs font-bold uppercase tracking-[0.15em]" style={{ fontFamily: 'var(--font-mono), monospace' }}>Transmit</span>
            <span className="text-[9px] tracking-[0.1em] opacity-70">↵ Enter</span>
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {['Look around', 'Attack', 'Roll for initiative', 'Speak to NPC', 'Search area'].map((action) => (
            <button
              key={action}
              onClick={() => onChange(action)}
              className="border border-gunmetal/60 bg-smog/60 px-3 py-1 text-[10px] uppercase tracking-[0.1em] text-ash/70 transition-all duration-200 hover:border-copper/60 hover:text-copper"
              style={{ fontFamily: 'var(--font-mono), monospace', clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)' }}
            >
              {action}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Active Game View ──────────────────────────────────────────────────────────

function ActiveGameView({
  campaign, world, players, messages, currentUserId, devShowReveal, onDismissReveal,
}: {
  campaign: Campaign;
  world: World;
  players: Player[];
  messages: Message[];
  currentUserId: string;
  devShowReveal: boolean;
  onDismissReveal: () => void;
}) {
  const feedRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [imageModal, setImageModal] = useState<ImageModalState | null>(null);

  const revealModal: ImageModalState = {
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&q=80',
    caption: 'The Iron Serpent Company\'s vessel emerges from the smog — black hull, serpent crest.',
    isVisionReveal: true,
  };
  const displayModal = devShowReveal ? revealModal : imageModal;

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages]);

  const sortedMessages = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const handlePanelToggle = (panel: MobilePanel) => setMobilePanel((prev) => (prev === panel ? null : panel));
  const handleImageClick = (state: ImageModalState) => setImageModal(state);
  const handleModalClose = () => {
    if (devShowReveal) {
      onDismissReveal();
      return;
    }

    setImageModal(null);
  };

  const galleryImages = messages.filter((m) => m.image_url);

  return (
    <div className="relative flex h-[100dvh] overflow-hidden bg-soot">
      <EmberParticles count={8} />
      <div className="furnace-overlay" style={{ opacity: 0.4 }} />
      <div className="vignette" />

      {/* Desktop left */}
      <DesktopLeftSidebar campaign={campaign} players={players} currentUserId={currentUserId} />

      {/* Center */}
      <main className="relative z-10 flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-gunmetal bg-iron/60 px-4 py-3 sm:px-6" style={{ backdropFilter: 'blur(4px)' }}>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {/* Mobile crew avatars */}
            <div className="flex -space-x-1 lg:hidden">
              {players.slice(0, 3).map((p) => {
                const pct = p.stats.hp / p.stats.hp_max;
                const color = pct > 0.6 ? 'var(--patina)' : pct > 0.25 ? 'var(--amber)' : 'var(--furnace)';
                return (
                  <div
                    key={p.id}
                    className="flex h-7 w-7 items-center justify-center border border-gunmetal bg-smog text-[10px] font-bold text-ash"
                    style={{ clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)', fontFamily: 'var(--font-display), sans-serif', boxShadow: `0 0 0 1px ${color}66` }}
                  >
                    {(p.character_name ?? p.username)[0].toUpperCase()}
                  </div>
                );
              })}
              {players.length > 3 && (
                <div className="flex h-7 w-7 items-center justify-center border border-gunmetal/60 bg-smog/60 text-[9px] text-ash/60"
                  style={{ clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)', fontFamily: 'var(--font-mono), monospace' }}>
                  +{players.length - 3}
                </div>
              )}
            </div>
            <span className="truncate text-sm font-bold uppercase tracking-[0.1em] text-steam sm:text-base"
              style={{ fontFamily: 'var(--font-display), sans-serif', textShadow: '0 0 20px rgba(196,148,61,0.3)' }}>
              {campaign.name}
            </span>
            <div className="hidden h-4 w-px bg-gunmetal sm:block" />
            <span className="hidden truncate text-xs uppercase tracking-[0.15em] text-ash/70 sm:block" style={{ fontFamily: 'var(--font-mono), monospace' }}>
              {world.name}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-patina" style={{ boxShadow: '0 0 6px var(--patina)', animation: 'pulse 2s ease-in-out infinite' }} />
            <span className="hidden text-[10px] uppercase tracking-[0.2em] text-patina sm:block" style={{ fontFamily: 'var(--font-mono), monospace' }}>Session Active</span>
          </div>
        </header>

        {/* Feed */}
        <div
          ref={feedRef}
          className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--gunmetal) transparent',
            paddingBottom: 'calc(116px + env(safe-area-inset-bottom, 0px))',
          }}
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-5 sm:gap-6">
            {sortedMessages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} players={players} onImageClick={handleImageClick} />
            ))}
            {/* GM typing */}
            <div className="flex items-center gap-2 pl-2 opacity-60 sm:pl-4">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center border border-brass/40 bg-brass/10"
                style={{ clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)' }}>
                <div className="h-1.5 w-1.5 rounded-full bg-amber" style={{ boxShadow: '0 0 4px var(--amber)', animation: 'pulse 1.2s ease-in-out infinite' }} />
              </div>
              <span className="text-[10px] uppercase tracking-[0.2em] text-brass/60" style={{ fontFamily: 'var(--font-mono), monospace' }}>Game Master is composing...</span>
            </div>
          </div>
        </div>

        <DesktopActionConsole value={inputValue} onChange={setInputValue} />
      </main>

      {/* Desktop right */}
      <DesktopRightSidebar world={world} messages={messages} onImageClick={handleImageClick} />

      {/* Mobile UI */}
      <MobileActionBar value={inputValue} onChange={setInputValue} />
      <MobileTabBar mobilePanel={mobilePanel} onPanelToggle={handlePanelToggle} playerCount={players.length} />

      {/* Mobile crew panel */}
      <MobilePanel open={mobilePanel === 'crew'} title="Party" onClose={() => setMobilePanel(null)}>
        <div className="flex flex-col gap-3">
          {players.map((player) => (
            <PlayerCard key={player.id} player={player} isCurrentUser={player.user_id === currentUserId} />
          ))}
        </div>
      </MobilePanel>

      {/* Mobile world panel */}
      <MobilePanel open={mobilePanel === 'log'} title="Expedition Log" onClose={() => setMobilePanel(null)}>
        {/* World image — clickable */}
        <button
          onClick={() => world.cover_image_url && handleImageClick({ url: world.cover_image_url, caption: world.name })}
          className="group relative mb-4 block w-full overflow-hidden border border-gunmetal"
          style={{
            clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
            cursor: world.cover_image_url ? 'pointer' : 'default',
          }}
        >
          {world.cover_image_url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={world.cover_image_url} alt={world.name} className="h-40 w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
              <div className="absolute inset-0 flex items-center justify-center bg-soot/0 transition-colors duration-300 group-hover:bg-soot/20">
                <div className="flex items-center gap-1.5 border border-brass/60 bg-soot/80 px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  style={{ clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)', backdropFilter: 'blur(4px)' }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1 9L9 1M9 1H4M9 1V6" stroke="var(--brass)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-[9px] uppercase tracking-[0.15em] text-brass" style={{ fontFamily: 'var(--font-mono), monospace' }}>Expand</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-40 items-center justify-center bg-smog/60">
              <span className="text-2xl text-gunmetal" style={{ fontFamily: 'var(--font-display), sans-serif' }}>MAP</span>
            </div>
          )}
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(0deg, rgba(13,12,10,0.7) 0%, transparent 60%)' }} />
          <div className="absolute bottom-2 left-3">
            <span className="text-sm font-bold uppercase tracking-[0.08em] text-steam" style={{ fontFamily: 'var(--font-display), sans-serif', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
              {world.name}
            </span>
          </div>
        </button>

        {/* Gallery */}
        <div className="mb-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-gradient-to-r from-copper/30 to-transparent" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-copper/70" style={{ fontFamily: 'var(--font-mono), monospace' }}>Gallery</span>
        </div>
        {galleryImages.length === 0 ? (
          <p className="text-[10px] uppercase tracking-[0.1em] text-ash/30" style={{ fontFamily: 'var(--font-mono), monospace' }}>No visions recorded yet</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {galleryImages.slice(-6).reverse().map((m) => (
              <GalleryThumb key={m.id} imageUrl={m.image_url!} onClick={() => handleImageClick({ url: m.image_url! })} />
            ))}
          </div>
        )}
      </MobilePanel>

      {/* Image Modal */}
      {displayModal && <ImageModal modal={displayModal} onClose={handleModalClose} />}
    </div>
  );
}

// ─── Dev State Switcher ────────────────────────────────────────────────────────

function DevStateSwitcher({ currentState, onChange }: { currentState: GameViewState; onChange: (s: GameViewState) => void }) {
  const states: { id: GameViewState; label: string }[] = [
    { id: 'loading', label: 'Loading' },
    { id: 'active', label: 'Active' },
    { id: 'image-reveal', label: 'Vision' },
  ];
  return (
    <div className="fixed bottom-20 left-1/2 z-[100] -translate-x-1/2 lg:bottom-6">
      <div
        className="flex items-center gap-1 border border-amber/40 bg-soot/90 px-2 py-1.5 sm:px-3 sm:py-2"
        style={{ backdropFilter: 'blur(8px)', clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)', boxShadow: '0 0 20px rgba(232,168,53,0.15)' }}
      >
        <span className="mr-2 text-[8px] uppercase tracking-[0.2em] text-amber/60 sm:mr-3 sm:text-[9px]" style={{ fontFamily: 'var(--font-mono), monospace' }}>Dev</span>
        {states.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="px-2 py-0.5 text-[9px] uppercase tracking-[0.1em] transition-all duration-200 sm:px-3 sm:py-1 sm:tracking-[0.15em]"
            style={{
              fontFamily: 'var(--font-mono), monospace',
              background: currentState === id ? 'var(--brass)' : 'transparent',
              color: currentState === id ? 'var(--soot)' : 'var(--ash)',
              clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)',
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function GameClient({ campaign, world, players: dbPlayers, messages: dbMessages, currentUserId }: GameClientProps) {
  const [devState, setDevState] = useState<GameViewState>('loading');

  const players = dbPlayers.length > 0 ? dbPlayers : MOCK_PLAYERS;
  const messages = dbMessages.length > 0 ? dbMessages : MOCK_MESSAGES;

  // Resolve background: latest session image → world image → undefined (fallback to piston state)
  const sessionImageUrl = [...messages].reverse().find((m) => m.image_url)?.image_url ?? undefined;
  const loadingBg = sessionImageUrl ?? world.cover_image_url ?? undefined;

  const isCampaignReady = devState !== 'loading';
  const devShowReveal = devState === 'image-reveal';

  const handleDismissReveal = () => setDevState('active');

  if (!isCampaignReady) {
    return (
      <>
        <LoadingState campaignName={campaign.name} backgroundImageUrl={loadingBg} />
        <DevStateSwitcher currentState={devState} onChange={setDevState} />
      </>
    );
  }

  return (
    <>
      <ActiveGameView
        campaign={campaign}
        world={world}
        players={players}
        messages={messages}
        currentUserId={currentUserId}
        devShowReveal={devShowReveal}
        onDismissReveal={handleDismissReveal}
      />
      <DevStateSwitcher currentState={devState} onChange={setDevState} />
    </>
  );
}
