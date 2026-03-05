'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { EmberParticles } from '@/components/ember-particles';
import { AmbientSmoke } from '@/components/ambient-smoke';
import { GearDecoration } from '@/components/gear-decoration';
import { waitForSessionOpeningReady } from './session-readiness';
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
  openingReady: boolean;
  loadingImageUrl?: string;
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
    created_at: '2026-03-05T11:54:00.000Z'
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
    created_at: '2026-03-05T11:55:00.000Z'
  },
  {
    id: '2',
    campaign_id: 'c1',
    session_id: 's1',
    player_id: 'p1',
    content:
      'I pull out my compass and check our bearing. "How much time before we dock at the Meridian Tower?"',
    image_url: null,
    type: 'action',
    created_at: '2026-03-05T11:56:00.000Z'
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
    created_at: '2026-03-05T11:57:00.000Z'
  },
  {
    id: '4',
    campaign_id: 'c1',
    session_id: 's1',
    player_id: 'p2',
    content:
      'I move to the starboard side and peer through my spyglass at the rival vessel. Can I make out their markings?',
    image_url: null,
    type: 'action',
    created_at: '2026-03-05T11:58:00.000Z'
  },
  {
    id: '5',
    campaign_id: 'c1',
    session_id: 's1',
    player_id: null,
    content:
      "Roll Perception. The spyglass reveals a black hull with a serpent-and-gear sigil — the **Iron Serpent Company**, private enforcers for the Brass Consortium. They haven't spotted you yet, but they're running dark: no running lights, no registry beacon. Whatever they're doing out here isn't official business.",
    image_url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=800&q=80',
    type: 'narration',
    created_at: '2026-03-05T11:59:00.000Z'
  }
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
    joined_at: new Date(Date.now() - 3600000).toISOString()
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
    joined_at: new Date(Date.now() - 3500000).toISOString()
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
    joined_at: new Date(Date.now() - 3400000).toISOString()
  }
];

// ─── Loading State ─────────────────────────────────────────────────────────────

function LoadingState({
  campaignName,
  backgroundImageUrl
}: {
  campaignName: string;
  backgroundImageUrl?: string;
}) {
  const [phase, setPhase] = useState(0);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [irisOpen, setIrisOpen] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);

  const phases = [
    'Calibrating narrative engines',
    'Loading world memory',
    'Synchronizing player manifests',
    'Igniting the furnace',
    'Campaign standing by'
  ];

  useEffect(() => {
    if (phase >= phases.length - 1) return;
    const t = setTimeout(() => setPhase((p) => p + 1), 1200);
    return () => clearTimeout(t);
  }, [phase, phases.length]);

  // Iris reveal: open after image loads (or immediately for no-image)
  useEffect(() => {
    if (!backgroundImageUrl) {
      setIrisOpen(true);
      const t = setTimeout(() => setContentVisible(true), 200);
      return () => clearTimeout(t);
    }
  }, [backgroundImageUrl]);

  useEffect(() => {
    if (!imgLoaded) return;
    const t1 = setTimeout(() => setIrisOpen(true), 100);
    const t2 = setTimeout(() => setContentVisible(true), 1800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [imgLoaded]);

  // Fallback reveal if image never loads
  useEffect(() => {
    if (!backgroundImageUrl) return;
    let revealContentTimeout: ReturnType<typeof setTimeout> | null = null;
    const t = setTimeout(() => {
      setIrisOpen(true);
      revealContentTimeout = setTimeout(() => setContentVisible(true), 1800);
    }, 2500);
    return () => {
      clearTimeout(t);
      if (revealContentTimeout) clearTimeout(revealContentTimeout);
    };
  }, [backgroundImageUrl]);

  const hasImage = !!backgroundImageUrl;
  const pct = ((phase + 1) / phases.length) * 100;

  return (
    <div className="relative flex h-[100dvh] min-h-screen flex-col overflow-hidden bg-soot">
      {/* ── Image mode: porthole iris reveal ── */}
      {hasImage && (
        <>
          {/* Iris container — clips to expanding circle */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              clipPath: irisOpen ? 'circle(120% at 50% 42%)' : 'circle(7vmin at 50% 42%)',
              transition: irisOpen
                ? 'clip-path 2.4s cubic-bezier(0.16, 1, 0.3, 1)'
                : 'none'
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={backgroundImageUrl}
              alt=""
              onLoad={() => setImgLoaded(true)}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ filter: 'saturate(0.8) brightness(0.65)' }}
            />
          </div>

          {/* Atmospheric overlays — fade in after iris */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1/4"
            style={{
              background: 'linear-gradient(180deg, var(--soot) 0%, transparent 100%)',
              opacity: contentVisible ? 1 : 0,
              transition: 'opacity 1.2s ease'
            }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5"
            style={{
              background:
                'linear-gradient(0deg, var(--soot) 0%, rgba(13,12,10,0.75) 40%, transparent 100%)',
              opacity: contentVisible ? 1 : 0,
              transition: 'opacity 1s ease'
            }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
            style={{
              background:
                'radial-gradient(ellipse 90% 60% at 50% 100%, rgba(212,98,42,0.15) 0%, transparent 70%)'
            }}
          />
        </>
      )}

      {/* Atmospheric layers */}
      <EmberParticles count={hasImage ? 18 : 14} />
      <div className="furnace-overlay" style={{ opacity: hasImage ? 0.25 : 1 }} />
      {!hasImage && <GearDecoration />}
      {!hasImage && <AmbientSmoke />}
      <div className="vignette" />

      {hasImage ? (
        /* ── IMAGE MODE: stamped title + teletype dispatch ─────────────── */
        <div className="relative z-10 flex flex-1 flex-col">
          {/* Campaign title — stamps in letter by letter */}
          <div
            className="flex flex-1 flex-col items-center justify-start px-6 pt-12 sm:pt-16 text-center"
            style={{ opacity: contentVisible ? 1 : 0, transition: 'opacity 0.6s ease' }}
          >
            {/* Eyebrow label */}
            <div
              className="mb-5 flex items-center gap-3 text-[9px] uppercase tracking-[0.5em] text-brass/70"
              style={{ fontFamily: 'var(--font-mono), monospace' }}
            >
              <span className="h-px w-8 bg-brass/40" />
              Campaign Briefing
              <span className="h-px w-8 bg-brass/40" />
            </div>

            {/* Title — each letter stamps in */}
            <h1
              className="uppercase leading-none tracking-[0.12em] text-steam"
              style={{
                fontFamily: 'var(--font-display), sans-serif',
                fontSize: 'clamp(2.6rem, 8vw, 6.5rem)',
                textShadow:
                  '0 4px 60px rgba(13,12,10,0.95), 0 0 100px rgba(196,148,61,0.2)'
              }}
            >
              {campaignName.split('').map((char, i) => (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    opacity: contentVisible ? 1 : 0,
                    transform: contentVisible
                      ? 'translateY(0) scale(1)'
                      : 'translateY(-12px) scale(1.15)',
                    transition: `opacity 0.35s ease ${i * 0.045}s, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 0.045}s`
                  }}
                >
                  {char === ' ' ? '\u00a0' : char}
                </span>
              ))}
            </h1>
          </div>

          {/* Dispatch strip — slim bottom bar, keeps focal area clear */}
          <div
            className="relative flex flex-col gap-2 px-6 pb-8 sm:pb-10"
            style={{
              opacity: contentVisible ? 1 : 0,
              transition: 'opacity 0.8s ease 0.4s'
            }}
          >
            {/* Single-line phase indicator */}
            <div
              className="flex items-center justify-center gap-3"
              style={{
                background: 'rgba(13,12,10,0.6)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(97,86,74,0.35)',
                padding: '6px 16px',
              }}
            >
              {/* Pulse dot */}
              <div
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber"
                style={{
                  boxShadow: '0 0 5px var(--amber)',
                  animation: 'pulse 2s ease-in-out infinite'
                }}
              />
              {/* Current phase text */}
              <span
                className="text-[10px] uppercase tracking-[0.3em] text-steam"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                {phases[phase]}
                <span style={{ animation: 'blink 1.1s step-end infinite' }}>_</span>
              </span>
              {/* Step counter */}
              <span
                className="text-[9px] tracking-[0.15em] text-brass/50 shrink-0"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                {phase + 1}/{phases.length}
              </span>
            </div>

            {/* Pipeline progress bar */}
            <div className="relative">
              <div
                className="relative h-[4px] overflow-hidden"
                style={{
                  background: 'var(--iron)',
                  border: '1px solid var(--gunmetal)',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)'
                }}
              >
                <div
                  className="absolute inset-y-0 left-0 transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    background:
                      'linear-gradient(90deg, var(--copper), var(--brass), var(--amber))',
                    boxShadow: '0 0 8px rgba(232,168,53,0.6)'
                  }}
                />
                <div
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${pct}%`,
                    background:
                      'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)',
                    animation: 'steamFlow 1.4s linear infinite',
                    transition: 'width 0.7s ease'
                  }}
                />
              </div>
              {[0, 25, 50, 75, 100].map((pos) => (
                <div
                  key={pos}
                  className="absolute top-1/2 h-[8px] w-[3px]"
                  style={{
                    left: `${pos}%`,
                    background:
                      (pos / 100) * phases.length <= phase + 1
                        ? 'var(--brass)'
                        : 'var(--gunmetal)',
                    transition: 'background 0.5s ease',
                    transform: 'translateY(-50%) translateX(-50%)'
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ── NO-IMAGE MODE: astrolabe compass with pressure arc ─────────── */
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center sm:gap-8">
          {/* Rotating astrolabe behind everything */}
          <div
            className="pointer-events-none absolute"
            style={{
              width: 'min(70vw, 500px)',
              height: 'min(70vw, 500px)',
              opacity: 0.06,
              animation: 'astroRotate 80s linear infinite'
            }}
          >
            <svg
              viewBox="0 0 400 400"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ width: '100%', height: '100%' }}
            >
              {/* Outer ring */}
              <circle cx="200" cy="200" r="195" stroke="#c4943d" strokeWidth="1.5" />
              <circle cx="200" cy="200" r="185" stroke="#c4943d" strokeWidth="0.5" />
              {/* Degree marks */}
              {Array.from({ length: 72 }).map((_, i) => {
                const angle = (i * 5 * Math.PI) / 180;
                const isMajor = i % 9 === 0;
                const r1 = 180,
                  r2 = isMajor ? 168 : 175;
                return (
                  <line
                    key={i}
                    x1={200 + r1 * Math.sin(angle)}
                    y1={200 - r1 * Math.cos(angle)}
                    x2={200 + r2 * Math.sin(angle)}
                    y2={200 - r2 * Math.cos(angle)}
                    stroke="#c4943d"
                    strokeWidth={isMajor ? 1.5 : 0.5}
                  />
                );
              })}
              {/* Inner rings */}
              <circle cx="200" cy="200" r="140" stroke="#b87333" strokeWidth="1" />
              <circle
                cx="200"
                cy="200"
                r="100"
                stroke="#c4943d"
                strokeWidth="0.5"
                strokeDasharray="4 6"
              />
              <circle cx="200" cy="200" r="60" stroke="#b87333" strokeWidth="1" />
              {/* Cross hairs */}
              <line x1="200" y1="10" x2="200" y2="55" stroke="#c4943d" strokeWidth="1" />
              <line
                x1="200"
                y1="345"
                x2="200"
                y2="390"
                stroke="#c4943d"
                strokeWidth="1"
              />
              <line x1="10" y1="200" x2="55" y2="200" stroke="#c4943d" strokeWidth="1" />
              <line
                x1="345"
                y1="200"
                x2="390"
                y2="200"
                stroke="#c4943d"
                strokeWidth="1"
              />
              {/* Diagonal spokes */}
              {[45, 135, 225, 315].map((deg) => {
                const r = (Math.PI * deg) / 180;
                return (
                  <line
                    key={deg}
                    x1={200 + 55 * Math.cos(r)}
                    y1={200 + 55 * Math.sin(r)}
                    x2={200 + 138 * Math.cos(r)}
                    y2={200 + 138 * Math.sin(r)}
                    stroke="#c4943d"
                    strokeWidth="0.5"
                  />
                );
              })}
              {/* Center */}
              <circle cx="200" cy="200" r="8" stroke="#c4943d" strokeWidth="1.5" />
              <circle cx="200" cy="200" r="3" fill="#c4943d" />
            </svg>
          </div>

          {/* Counter-rotating inner ring */}
          <div
            className="pointer-events-none absolute"
            style={{
              width: 'min(35vw, 240px)',
              height: 'min(35vw, 240px)',
              opacity: 0.08,
              animation: 'astroRotate 45s linear infinite reverse'
            }}
          >
            <svg
              viewBox="0 0 200 200"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ width: '100%', height: '100%' }}
            >
              <circle
                cx="100"
                cy="100"
                r="95"
                stroke="#b87333"
                strokeWidth="1"
                strokeDasharray="3 5"
              />
              {Array.from({ length: 24 }).map((_, i) => {
                const a = (i * 15 * Math.PI) / 180;
                return (
                  <line
                    key={i}
                    x1={100 + 88 * Math.sin(a)}
                    y1={100 - 88 * Math.cos(a)}
                    x2={100 + 78 * Math.sin(a)}
                    y2={100 - 78 * Math.cos(a)}
                    stroke="#b87333"
                    strokeWidth="1"
                  />
                );
              })}
              <circle cx="100" cy="100" r="45" stroke="#b87333" strokeWidth="0.5" />
            </svg>
          </div>

          {/* Campaign name */}
          <div className="relative flex flex-col items-center gap-3">
            <div
              className="text-[9px] uppercase tracking-[0.5em] text-copper"
              style={{ fontFamily: 'var(--font-mono), monospace' }}
            >
              ── Campaign ──
            </div>
            <h1
              className="uppercase leading-none tracking-[0.1em]"
              style={{
                fontFamily: 'var(--font-display), sans-serif',
                fontSize: 'clamp(2.8rem, 9vw, 5.5rem)',
                color: 'var(--steam)',
                textShadow:
                  '0 0 60px rgba(196,148,61,0.35), 0 2px 20px rgba(13,12,10,0.9)'
              }}
            >
              {campaignName}
            </h1>
          </div>

          {/* Pressure gauge arc — main loading indicator */}
          <div
            className="relative"
            style={{ width: 'min(52vw, 220px)', height: 'min(26vw, 110px)' }}
          >
            <svg
              viewBox="0 0 220 110"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ width: '100%', height: '100%', overflow: 'visible' }}
            >
              {/* Track arc (bottom half of circle) */}
              <path
                d="M 15 110 A 95 95 0 0 1 205 110"
                stroke="#2a2520"
                strokeWidth="12"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M 15 110 A 95 95 0 0 1 205 110"
                stroke="#3d3630"
                strokeWidth="8"
                strokeLinecap="round"
                fill="none"
              />
              {/* Filled arc — phase progress */}
              <path
                d="M 15 110 A 95 95 0 0 1 205 110"
                stroke="url(#gaugeGrad)"
                strokeWidth="8"
                strokeLinecap="round"
                fill="none"
                strokeDasharray="298.5"
                strokeDashoffset={298.5 * (1 - pct / 100)}
                style={{
                  transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
              />
              {/* Glow arc */}
              <path
                d="M 15 110 A 95 95 0 0 1 205 110"
                stroke="url(#gaugeGlow)"
                strokeWidth="16"
                strokeLinecap="round"
                fill="none"
                strokeDasharray="298.5"
                strokeDashoffset={298.5 * (1 - pct / 100)}
                style={{
                  transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                  filter: 'blur(4px)',
                  opacity: 0.5
                }}
              />
              {/* Tick marks */}
              {phases.map((_, i) => {
                const t = i / (phases.length - 1);
                const angle = Math.PI + t * Math.PI;
                const cx = 110 + 95 * Math.cos(angle);
                const cy = 110 + 95 * Math.sin(angle);
                const ix = 110 + 79 * Math.cos(angle);
                const iy = 110 + 79 * Math.sin(angle);
                const lit = i <= phase;
                return (
                  <g key={i}>
                    <line
                      x1={cx}
                      y1={cy}
                      x2={ix}
                      y2={iy}
                      stroke={lit ? '#c4943d' : '#3d3630'}
                      strokeWidth="2"
                      style={{ transition: 'stroke 0.4s' }}
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r="3"
                      fill={lit ? '#e8a835' : '#2a2520'}
                      style={{
                        transition: 'fill 0.4s',
                        filter: lit ? 'drop-shadow(0 0 4px #e8a835)' : 'none'
                      }}
                    />
                  </g>
                );
              })}
              {/* Center hub */}
              <circle
                cx="110"
                cy="110"
                r="10"
                fill="#1a1814"
                stroke="#3d3630"
                strokeWidth="1.5"
              />
              <circle cx="110" cy="110" r="4" fill="#c4943d" />
              {/* Needle */}
              {(() => {
                const needleAngle = Math.PI + (pct / 100) * Math.PI;
                const nx = 110 + 80 * Math.cos(needleAngle);
                const ny = 110 + 80 * Math.sin(needleAngle);
                const bx = 110 - 12 * Math.cos(needleAngle);
                const by = 110 - 12 * Math.sin(needleAngle);
                return (
                  <line
                    x1={bx}
                    y1={by}
                    x2={nx}
                    y2={ny}
                    stroke="var(--furnace)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    style={{
                      transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                      filter: 'drop-shadow(0 0 4px rgba(212,98,42,0.8))'
                    }}
                  />
                );
              })()}
              <defs>
                <linearGradient
                  id="gaugeGrad"
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="0"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="#b87333" />
                  <stop offset="50%" stopColor="#c4943d" />
                  <stop offset="100%" stopColor="#e8a835" />
                </linearGradient>
                <linearGradient
                  id="gaugeGlow"
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="0"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="#b87333" />
                  <stop offset="100%" stopColor="#e8a835" />
                </linearGradient>
              </defs>
            </svg>
            {/* Gauge label below needle center */}
            <div className="absolute bottom-0 inset-x-0 flex justify-center">
              <div
                className="text-[9px] uppercase tracking-[0.3em] text-ash"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                Saga Engine
              </div>
            </div>
          </div>

          {/* Phase text — teletype */}
          <div
            className="min-h-[1.5rem] max-w-xs text-[10px] uppercase tracking-[0.2em] text-amber/80 sm:text-xs"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            {phases[phase]}
            <span style={{ animation: 'blink 1.1s step-end infinite' }}>_</span>
          </div>

          {/* Three status nodes — World / Players / AI GM */}
          <div className="flex items-center gap-4 sm:gap-6">
            {['World', 'Players', 'AI GM'].map((label, i) => {
              const lit = phase > i;
              return (
                <div key={label} className="flex flex-col items-center gap-2">
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      border: `2px solid ${lit ? 'var(--brass)' : 'var(--gunmetal)'}`,
                      background: lit
                        ? 'radial-gradient(circle at 35% 35%, rgba(196,148,61,0.2), rgba(13,12,10,0.9))'
                        : 'var(--iron)',
                      boxShadow: lit
                        ? '0 0 16px rgba(196,148,61,0.35), inset 0 0 8px rgba(196,148,61,0.1)'
                        : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.6s ease'
                    }}
                  >
                    <span
                      className="text-[9px] font-bold"
                      style={{
                        fontFamily: 'var(--font-mono), monospace',
                        color: lit ? 'var(--amber)' : 'var(--gunmetal)',
                        transition: 'color 0.4s'
                      }}
                    >
                      {lit ? 'OK' : '--'}
                    </span>
                  </div>
                  <span
                    className="text-[9px] uppercase tracking-[0.18em]"
                    style={{
                      fontFamily: 'var(--font-mono), monospace',
                      color: lit ? 'var(--ash)' : 'var(--gunmetal)',
                      transition: 'color 0.4s'
                    }}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes astroRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes steamFlow {
          from { transform: translateX(-100%); }
          to { transform: translateX(200%); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
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
      <div
        className="absolute inset-y-0 left-0 transition-all duration-500"
        style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}66` }}
      />
    </div>
  );
}

// ─── Player Card ──────────────────────────────────────────────────────────────

function PlayerCard({
  player,
  isCurrentUser,
  compact = false
}: {
  player: Player;
  isCurrentUser: boolean;
  compact?: boolean;
}) {
  const isLowHp = player.stats.hp / player.stats.hp_max < 0.25;
  return (
    <div
      className={`iron-plate relative flex flex-col gap-2 p-3 transition-all duration-300 ${isCurrentUser ? 'ring-1 ring-brass/40' : ''} ${isLowHp ? 'ring-1 ring-furnace/50' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-gunmetal bg-smog ${compact ? 'h-9 w-9' : 'h-11 w-11'}`}
          style={{
            clipPath:
              'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)'
          }}
        >
          {player.character_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={player.character_image_url}
              alt={player.character_name ?? ''}
              className="h-full w-full object-cover"
            />
          ) : (
            <span
              className="font-bold text-ash"
              style={{
                fontSize: compact ? '0.875rem' : '1rem',
                fontFamily: 'var(--font-display), sans-serif'
              }}
            >
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
          <span
            className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-steam"
            style={{ fontFamily: 'var(--font-heading), serif' }}
          >
            {player.character_name ?? player.username}
          </span>
          <span
            className="truncate text-[10px] uppercase tracking-[0.12em] text-copper"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            {player.character_class ?? 'Unknown'}
          </span>
        </div>
        <span
          className="shrink-0 text-[10px] text-ash/70"
          style={{ fontFamily: 'var(--font-mono), monospace' }}
        >
          {player.stats.hp}/{player.stats.hp_max}
        </span>
      </div>
      <HpBar hp={player.stats.hp} hpMax={player.stats.hp_max} />
      <div className="absolute right-2 top-2">
        <div
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: player.status === 'active' ? 'var(--patina)' : 'var(--ash)',
            boxShadow: player.status === 'active' ? '0 0 4px var(--patina)' : 'none'
          }}
        />
      </div>
    </div>
  );
}

// ─── Mobile Slide Panel ────────────────────────────────────────────────────────

function MobilePanel({
  open,
  title,
  onClose,
  children
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-30 lg:hidden"
        style={{
          background: 'rgba(13,12,10,0.7)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'all' : 'none',
          transition: 'opacity 0.3s',
          backdropFilter: 'blur(2px)'
        }}
        onClick={onClose}
      />
      <div
        className="fixed inset-x-0 bottom-0 z-40 flex max-h-[80vh] flex-col border-t border-gunmetal bg-iron/95 lg:hidden"
        style={{
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1)',
          backdropFilter: 'blur(8px)',
          paddingBottom: '112px'
        }}
      >
        <div className="flex justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-gunmetal" />
        </div>
        <div className="flex items-center justify-between border-b border-gunmetal px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-px w-6 bg-gradient-to-r from-brass/40 to-transparent" />
            <span
              className="text-[10px] uppercase tracking-[0.25em] text-brass"
              style={{ fontFamily: 'var(--font-mono), monospace' }}
            >
              {title}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center border border-gunmetal/60 text-ash/60 transition-colors hover:border-copper hover:text-copper"
            style={{
              clipPath:
                'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)'
            }}
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

function MobileTabBar({
  mobilePanel,
  onPanelToggle,
  playerCount
}: {
  mobilePanel: MobilePanel;
  onPanelToggle: (panel: MobilePanel) => void;
  playerCount: number;
}) {
  const tabs = [
    {
      id: 'crew' as const,
      label: 'Crew',
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M3 15c0-3.314 2.686-6 6-6s6 2.686 6 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )
    },
    {
      id: 'log' as const,
      label: 'World',
      icon: (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M2.5 9h13M9 2.5c-2 2-3 4-3 6.5s1 4.5 3 6.5M9 2.5c2 2 3 4 3 6.5s-1 4.5-3 6.5"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
      )
    }
  ];

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 flex h-14 items-stretch border-t border-gunmetal bg-iron/95 lg:hidden"
      style={{ backdropFilter: 'blur(8px)' }}
    >
      <button
        className="flex flex-1 flex-col items-center justify-center gap-1 transition-colors"
        onClick={() => onPanelToggle(null)}
        style={{ color: mobilePanel === null ? 'var(--brass)' : 'var(--ash)' }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path
            d="M3 4h12M3 8h12M3 12h8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <span
          className="text-[9px] uppercase tracking-[0.12em]"
          style={{ fontFamily: 'var(--font-mono), monospace' }}
        >
          Chronicle
        </span>
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
          <span
            className="text-[9px] uppercase tracking-[0.12em]"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            {tab.label}
          </span>
          {mobilePanel === tab.id && (
            <div
              className="absolute inset-x-4 top-0 h-0.5 bg-brass"
              style={{ boxShadow: '0 0 6px var(--brass)' }}
            />
          )}
          {tab.id === 'crew' && playerCount > 0 && (
            <div
              className="absolute right-3 top-2 flex h-4 w-4 items-center justify-center bg-brass text-[9px] font-bold text-soot"
              style={{
                clipPath:
                  'polygon(2px 0, 100% 0, 100% calc(100% - 2px), calc(100% - 2px) 100%, 0 100%, 0 2px)'
              }}
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
      style={{
        clipPath:
          'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)'
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
      <div className="absolute inset-0 flex items-center justify-center bg-soot/0 transition-colors duration-200 group-hover:bg-soot/30">
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        >
          <path
            d="M1.5 12.5L12.5 1.5M12.5 1.5H6M12.5 1.5V8"
            stroke="var(--brass)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </button>
  );
}

// ─── Desktop Left Sidebar ─────────────────────────────────────────────────────

function DesktopLeftSidebar({
  campaign,
  players,
  currentUserId
}: {
  campaign: Campaign;
  players: Player[];
  currentUserId: string;
}) {
  return (
    <aside
      className="relative z-10 hidden w-56 shrink-0 flex-col border-r border-gunmetal bg-iron/80 lg:flex"
      style={{ backdropFilter: 'blur(4px)' }}
    >
      <div className="border-b border-gunmetal px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-gradient-to-r from-brass/40 to-transparent" />
          <span
            className="text-[10px] uppercase tracking-[0.25em] text-brass"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            Party
          </span>
          <div className="h-px flex-1 bg-gradient-to-l from-brass/40 to-transparent" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        {players.map((player) => (
          <PlayerCard
            key={player.id}
            player={player}
            isCurrentUser={player.user_id === currentUserId}
            compact
          />
        ))}
      </div>
      <div className="border-t border-gunmetal px-4 py-3">
        <div className="flex flex-col gap-1.5">
          {[
            { label: 'Mode', value: campaign.turn_mode, color: 'var(--copper)' },
            { label: 'Status', value: 'Live', color: 'var(--patina)', dot: true }
          ].map(({ label, value, color, dot }) => (
            <div key={label} className="flex justify-between">
              <span
                className="text-[9px] uppercase tracking-[0.1em] text-ash/60"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                {label}
              </span>
              <div className="flex items-center gap-1">
                {dot && (
                  <div
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: color, boxShadow: `0 0 4px ${color}` }}
                  />
                )}
                <span
                  className="text-[9px] uppercase"
                  style={{ color, fontFamily: 'var(--font-mono), monospace' }}
                >
                  {value}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

// ─── Desktop Right Sidebar ────────────────────────────────────────────────────

function DesktopRightSidebar({
  world,
  messages,
  onImageClick
}: {
  world: World;
  messages: Message[];
  onImageClick: (state: ImageModalState) => void;
}) {
  const galleryImages = messages.filter((m) => m.image_url);

  return (
    <aside
      className="relative z-10 hidden w-56 shrink-0 flex-col border-l border-gunmetal bg-iron/80 lg:flex"
      style={{ backdropFilter: 'blur(4px)' }}
    >
      {/* World image — clickable */}
      <button
        onClick={() =>
          world.cover_image_url &&
          onImageClick({ url: world.cover_image_url, caption: world.name })
        }
        className="group relative overflow-hidden border-b border-gunmetal"
        style={{ cursor: world.cover_image_url ? 'pointer' : 'default' }}
      >
        {world.cover_image_url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={world.cover_image_url}
              alt={world.name}
              className="h-32 w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-soot/0 transition-colors duration-300 group-hover:bg-soot/20">
              <div
                className="flex items-center gap-1.5 border border-brass/60 bg-soot/80 px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                style={{
                  clipPath:
                    'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)',
                  backdropFilter: 'blur(4px)'
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M1 9L9 1M9 1H4M9 1V6"
                    stroke="var(--brass)"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span
                  className="text-[9px] uppercase tracking-[0.15em] text-brass"
                  style={{ fontFamily: 'var(--font-mono), monospace' }}
                >
                  Expand
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-32 items-center justify-center bg-smog/60">
            <div className="flex flex-col items-center gap-1">
              <span
                className="text-2xl text-gunmetal"
                style={{ fontFamily: 'var(--font-display), sans-serif' }}
              >
                MAP
              </span>
              <span
                className="text-[9px] uppercase tracking-[0.2em] text-ash/40"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                Generating...
              </span>
            </div>
          </div>
        )}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(0deg, var(--iron) 0%, transparent 60%)' }}
        />
        <div className="absolute bottom-2 left-3">
          <span
            className="text-xs font-bold uppercase tracking-[0.08em] text-steam"
            style={{
              fontFamily: 'var(--font-display), sans-serif',
              textShadow: '0 1px 4px rgba(0,0,0,0.8)'
            }}
          >
            {world.name}
          </span>
        </div>
      </button>

      {/* Gallery */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-gradient-to-r from-copper/30 to-transparent" />
          <span
            className="text-[10px] uppercase tracking-[0.2em] text-copper/70"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            Gallery
          </span>
        </div>
        {galleryImages.length === 0 ? (
          <p
            className="text-[9px] uppercase tracking-[0.1em] text-ash/30"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            No visions recorded yet
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {galleryImages
              .slice(-6)
              .reverse()
              .map((m) => (
                <GalleryThumb
                  key={m.id}
                  imageUrl={m.image_url!}
                  onClick={() => onImageClick({ url: m.image_url! })}
                />
              ))}
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Desktop Action Console ────────────────────────────────────────────────────

function DesktopActionConsole({
  value,
  onChange
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      className="hidden border-t border-gunmetal bg-iron/70 px-6 py-4 lg:block"
      style={{ backdropFilter: 'blur(4px)' }}
    >
      <div className="mx-auto max-w-3xl">
        <div className="mb-2 flex items-center gap-2">
          <div className="h-px w-6 bg-gradient-to-r from-transparent to-copper/60" />
          <span
            className="text-[9px] uppercase tracking-[0.25em] text-copper/70"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            Action Console
          </span>
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
              clipPath:
                'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
              transition: 'border-color 0.2s, box-shadow 0.2s'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'var(--brass)';
              e.target.style.boxShadow =
                '0 0 0 1px rgba(196,148,61,0.2), inset 0 0 20px rgba(196,148,61,0.04)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'var(--gunmetal)';
              e.target.style.boxShadow = 'none';
            }}
          />
          <button
            className="flex shrink-0 flex-col items-center justify-center gap-1 px-6 py-3 text-soot transition-all duration-300 hover:shadow-[0_0_20px_rgba(196,148,61,0.4)] active:scale-[0.97]"
            style={{
              background:
                'linear-gradient(135deg, var(--copper), var(--brass), var(--copper))',
              clipPath:
                'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 8px rgba(0,0,0,0.4)'
            }}
          >
            <span
              className="text-xs font-bold uppercase tracking-[0.15em]"
              style={{ fontFamily: 'var(--font-mono), monospace' }}
            >
              Transmit
            </span>
            <span className="text-[9px] tracking-[0.1em] opacity-70">↵ Enter</span>
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            'Look around',
            'Attack',
            'Roll for initiative',
            'Speak to NPC',
            'Search area'
          ].map((action) => (
            <button
              key={action}
              onClick={() => onChange(action)}
              className="border border-gunmetal/60 bg-smog/60 px-3 py-1 text-[10px] uppercase tracking-[0.1em] text-ash/70 transition-all duration-200 hover:border-copper/60 hover:text-copper"
              style={{
                fontFamily: 'var(--font-mono), monospace',
                clipPath:
                  'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)'
              }}
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
  campaign,
  world,
  players,
  messages,
  currentUserId,
  devShowReveal,
  onDismissReveal
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
    caption:
      "The Iron Serpent Company's vessel emerges from the smog — black hull, serpent crest.",
    isVisionReveal: true
  };
  const displayModal = devShowReveal ? revealModal : imageModal;

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages]);

  const sortedMessages = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const handlePanelToggle = (panel: MobilePanel) =>
    setMobilePanel((prev) => (prev === panel ? null : panel));
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
      <DesktopLeftSidebar
        campaign={campaign}
        players={players}
        currentUserId={currentUserId}
      />

      {/* Center */}
      <main className="relative z-10 flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header
          className="flex items-center justify-between border-b border-gunmetal bg-iron/60 px-4 py-3 sm:px-6"
          style={{ backdropFilter: 'blur(4px)' }}
        >
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {/* Mobile crew avatars */}
            <div className="flex -space-x-1 lg:hidden">
              {players.slice(0, 3).map((p) => {
                const pct = p.stats.hp / p.stats.hp_max;
                const color =
                  pct > 0.6
                    ? 'var(--patina)'
                    : pct > 0.25
                      ? 'var(--amber)'
                      : 'var(--furnace)';
                return (
                  <div
                    key={p.id}
                    className="flex h-7 w-7 items-center justify-center border border-gunmetal bg-smog text-[10px] font-bold text-ash"
                    style={{
                      clipPath:
                        'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)',
                      fontFamily: 'var(--font-display), sans-serif',
                      boxShadow: `0 0 0 1px ${color}66`
                    }}
                  >
                    {(p.character_name ?? p.username)[0].toUpperCase()}
                  </div>
                );
              })}
              {players.length > 3 && (
                <div
                  className="flex h-7 w-7 items-center justify-center border border-gunmetal/60 bg-smog/60 text-[9px] text-ash/60"
                  style={{
                    clipPath:
                      'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)',
                    fontFamily: 'var(--font-mono), monospace'
                  }}
                >
                  +{players.length - 3}
                </div>
              )}
            </div>
            <span
              className="truncate text-sm font-bold uppercase tracking-[0.1em] text-steam sm:text-base"
              style={{
                fontFamily: 'var(--font-display), sans-serif',
                textShadow: '0 0 20px rgba(196,148,61,0.3)'
              }}
            >
              {campaign.name}
            </span>
            <div className="hidden h-4 w-px bg-gunmetal sm:block" />
            <span
              className="hidden truncate text-xs uppercase tracking-[0.15em] text-ash/70 sm:block"
              style={{ fontFamily: 'var(--font-mono), monospace' }}
            >
              {world.name}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div
              className="h-2 w-2 rounded-full bg-patina"
              style={{
                boxShadow: '0 0 6px var(--patina)',
                animation: 'pulse 2s ease-in-out infinite'
              }}
            />
            <span
              className="hidden text-[10px] uppercase tracking-[0.2em] text-patina sm:block"
              style={{ fontFamily: 'var(--font-mono), monospace' }}
            >
              Session Active
            </span>
          </div>
        </header>

        {/* Feed */}
        <div
          ref={feedRef}
          className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--gunmetal) transparent',
            paddingBottom: 'calc(116px + env(safe-area-inset-bottom, 0px))'
          }}
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-5 sm:gap-6">
            {sortedMessages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                players={players}
                onImageClick={handleImageClick}
              />
            ))}
            {/* GM typing */}
            <div className="flex items-center gap-2 pl-2 opacity-60 sm:pl-4">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center border border-brass/40 bg-brass/10"
                style={{
                  clipPath:
                    'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)'
                }}
              >
                <div
                  className="h-1.5 w-1.5 rounded-full bg-amber"
                  style={{
                    boxShadow: '0 0 4px var(--amber)',
                    animation: 'pulse 1.2s ease-in-out infinite'
                  }}
                />
              </div>
              <span
                className="text-[10px] uppercase tracking-[0.2em] text-brass/60"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                Game Master is composing...
              </span>
            </div>
          </div>
        </div>

        <DesktopActionConsole value={inputValue} onChange={setInputValue} />
      </main>

      {/* Desktop right */}
      <DesktopRightSidebar
        world={world}
        messages={messages}
        onImageClick={handleImageClick}
      />

      {/* Mobile UI */}
      <MobileActionBar value={inputValue} onChange={setInputValue} />
      <MobileTabBar
        mobilePanel={mobilePanel}
        onPanelToggle={handlePanelToggle}
        playerCount={players.length}
      />

      {/* Mobile crew panel */}
      <MobilePanel
        open={mobilePanel === 'crew'}
        title="Party"
        onClose={() => setMobilePanel(null)}
      >
        <div className="flex flex-col gap-3">
          {players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              isCurrentUser={player.user_id === currentUserId}
            />
          ))}
        </div>
      </MobilePanel>

      {/* Mobile world panel */}
      <MobilePanel
        open={mobilePanel === 'log'}
        title="Expedition Log"
        onClose={() => setMobilePanel(null)}
      >
        {/* World image — clickable */}
        <button
          onClick={() =>
            world.cover_image_url &&
            handleImageClick({ url: world.cover_image_url, caption: world.name })
          }
          className="group relative mb-4 block w-full overflow-hidden border border-gunmetal"
          style={{
            clipPath:
              'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
            cursor: world.cover_image_url ? 'pointer' : 'default'
          }}
        >
          {world.cover_image_url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={world.cover_image_url}
                alt={world.name}
                className="h-40 w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-soot/0 transition-colors duration-300 group-hover:bg-soot/20">
                <div
                  className="flex items-center gap-1.5 border border-brass/60 bg-soot/80 px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                  style={{
                    clipPath:
                      'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)',
                    backdropFilter: 'blur(4px)'
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M1 9L9 1M9 1H4M9 1V6"
                      stroke="var(--brass)"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span
                    className="text-[9px] uppercase tracking-[0.15em] text-brass"
                    style={{ fontFamily: 'var(--font-mono), monospace' }}
                  >
                    Expand
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-40 items-center justify-center bg-smog/60">
              <span
                className="text-2xl text-gunmetal"
                style={{ fontFamily: 'var(--font-display), sans-serif' }}
              >
                MAP
              </span>
            </div>
          )}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(0deg, rgba(13,12,10,0.7) 0%, transparent 60%)'
            }}
          />
          <div className="absolute bottom-2 left-3">
            <span
              className="text-sm font-bold uppercase tracking-[0.08em] text-steam"
              style={{
                fontFamily: 'var(--font-display), sans-serif',
                textShadow: '0 1px 4px rgba(0,0,0,0.8)'
              }}
            >
              {world.name}
            </span>
          </div>
        </button>

        {/* Gallery */}
        <div className="mb-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-gradient-to-r from-copper/30 to-transparent" />
          <span
            className="text-[10px] uppercase tracking-[0.2em] text-copper/70"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            Gallery
          </span>
        </div>
        {galleryImages.length === 0 ? (
          <p
            className="text-[10px] uppercase tracking-[0.1em] text-ash/30"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            No visions recorded yet
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {galleryImages
              .slice(-6)
              .reverse()
              .map((m) => (
                <GalleryThumb
                  key={m.id}
                  imageUrl={m.image_url!}
                  onClick={() => handleImageClick({ url: m.image_url! })}
                />
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

function DevStateSwitcher({
  currentState,
  onChange
}: {
  currentState: GameViewState;
  onChange: (s: GameViewState) => void;
}) {
  const states: { id: GameViewState; label: string }[] = [
    { id: 'loading', label: 'Loading' },
    { id: 'active', label: 'Active' },
    { id: 'image-reveal', label: 'Vision' }
  ];
  return (
    <div className="fixed bottom-20 left-1/2 z-[100] -translate-x-1/2 lg:bottom-6">
      <div
        className="flex items-center gap-1 border border-amber/40 bg-soot/90 px-2 py-1.5 sm:px-3 sm:py-2"
        style={{
          backdropFilter: 'blur(8px)',
          clipPath:
            'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
          boxShadow: '0 0 20px rgba(232,168,53,0.15)'
        }}
      >
        <span
          className="mr-2 text-[8px] uppercase tracking-[0.2em] text-amber/60 sm:mr-3 sm:text-[9px]"
          style={{ fontFamily: 'var(--font-mono), monospace' }}
        >
          Dev
        </span>
        {states.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="px-2 py-0.5 text-[9px] uppercase tracking-[0.1em] transition-all duration-200 sm:px-3 sm:py-1 sm:tracking-[0.15em]"
            style={{
              fontFamily: 'var(--font-mono), monospace',
              background: currentState === id ? 'var(--brass)' : 'transparent',
              color: currentState === id ? 'var(--soot)' : 'var(--ash)',
              clipPath:
                'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)'
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

export default function GameClient({
  campaign,
  world,
  players: dbPlayers,
  messages: dbMessages,
  currentUserId,
  openingReady,
  loadingImageUrl,
}: GameClientProps) {
  const [viewState, setViewState] = useState<GameViewState>(
    openingReady ? 'active' : 'loading'
  );
  const [devState, setDevState] = useState<GameViewState>(
    openingReady ? 'active' : 'loading'
  );

  const players = dbPlayers.length > 0 ? dbPlayers : MOCK_PLAYERS;
  const messages = dbMessages.length > 0 ? dbMessages : MOCK_MESSAGES;

  // Listen for game:started to leave the loading state
  useEffect(() => {
    if (openingReady) return;

    const supabase = createClient();
    let cancelled = false;
    const promoteToActive = () => {
      if (cancelled) return;
      setViewState('active');
      setDevState('active');
    };
    const fetchSession = () =>
      supabase
        .from('sessions')
        .select('opening_situation')
        .eq('campaign_id', campaign.id)
        .eq('session_number', 1)
        .maybeSingle();

    const channel = supabase
      .channel(`campaign:${campaign.id}`)
      .on('broadcast', { event: 'game:started' }, () => {
        promoteToActive();
      })
      .subscribe();

    void waitForSessionOpeningReady(fetchSession, {
      maxAttempts: 20,
      delayMs: 1500,
      shouldStop: () => cancelled,
    }).then((ready) => {
      if (ready) promoteToActive();
    });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [campaign.id, openingReady]);

  const effectiveState = viewState !== 'loading' ? devState : viewState;
  const isCampaignReady = effectiveState !== 'loading';
  const devShowReveal = effectiveState === 'image-reveal';

  const handleDismissReveal = () => setDevState('active');

  if (!isCampaignReady) {
    return (
      <>
        <LoadingState campaignName={campaign.name} backgroundImageUrl={loadingImageUrl} />
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
