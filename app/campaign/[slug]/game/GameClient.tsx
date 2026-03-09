'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { EmberParticles } from '@/components/ember-particles';
import { AmbientSmoke } from '@/components/ambient-smoke';
import { GearDecoration } from '@/components/gear-decoration';
import { ImageModal, type ImageModalState } from './components/ImageModal';
import { MessageBubble, NarrationGroupBubble } from './components/MessageBubble';
import { MobileActionBar } from './components/MobileActionBar';
import { DebounceTimer } from './components/DebounceTimer';
import { buildGameSessionSocketConfig } from './ws-auth';
import { useVoiceNarration } from './hooks/useVoiceNarration';
import type { UseVoiceNarration } from './hooks/useVoiceNarration';
import { appendStreamingContent } from './streaming-content';
import type { Campaign } from '@/types/campaign';
import type { Player } from '@/types/player';
import type { World } from '@/types/world';
import type { Message } from '@/types/message';
import { Volume2, VolumeX, RotateCcw } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GameClientProps {
  campaign: Campaign;
  world: World;
  players: Player[];
  messages: Message[];
  currentUserId: string;
  loadingImageUrl?: string;
  campaignCoverImageUrl?: string;
}

type GameViewState = 'loading' | 'active' | 'image-reveal';
type MobilePanel = null | 'crew' | 'log';

interface OptimisticMessage {
  id: string;
  playerId: string;
  playerName: string;
  content: string;
  timestamp: number;
  isOwn: boolean;
}

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
      const openTimeout = setTimeout(() => setIrisOpen(true), 0);
      const contentTimeout = setTimeout(() => setContentVisible(true), 200);
      return () => {
        clearTimeout(openTimeout);
        clearTimeout(contentTimeout);
      };
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
                padding: '6px 16px'
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
                    animation: 'steam-flow 1.4s linear infinite',
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
              animation: 'astro-rotate 80s linear infinite'
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
              animation: 'astro-rotate 45s linear infinite reverse'
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

    </div>
  );
}

// ─── HP Bar ───────────────────────────────────────────────────────────────────

function HpBar({ hp, hpMax, thick = false }: { hp: number; hpMax: number; thick?: boolean }) {
  const pct = Math.max(0, Math.min(100, (hp / hpMax) * 100));
  const color = pct > 60 ? 'var(--patina)' : pct > 25 ? 'var(--amber)' : 'var(--furnace)';
  return (
    <div
      className={`relative w-full overflow-hidden border border-gunmetal/60 bg-iron ${thick ? 'h-2' : 'h-1.5'}`}
    >
      <div
        className="absolute inset-y-0 left-0 transition-all duration-500"
        style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}66` }}
      />
    </div>
  );
}

// ─── My Player Tag ────────────────────────────────────────────────────────────
// Prominent card for the current user shown at the top of the left sidebar.

function MyPlayerTag({ player }: { player: Player }) {
  const hp = player.stats.hp;
  const hpMax = player.stats.hp_max;
  const hpPct = Math.max(0, Math.min(100, (hp / hpMax) * 100));
  const hpColor = hpPct > 60 ? 'var(--patina)' : hpPct > 25 ? 'var(--amber)' : 'var(--furnace)';
  const isLowHp = hpPct < 25;
  const displayName = player.character_name ?? player.username;

  return (
    <div
      className="relative flex flex-col gap-0 overflow-hidden"
      style={{
        border: `1px solid ${isLowHp ? 'rgba(212,98,42,0.5)' : 'rgba(196,148,61,0.35)'}`,
        background: isLowHp
          ? 'linear-gradient(160deg, rgba(212,98,42,0.07) 0%, rgba(13,12,10,0.9) 60%)'
          : 'linear-gradient(160deg, rgba(196,148,61,0.07) 0%, rgba(13,12,10,0.9) 60%)',
        boxShadow: isLowHp
          ? '0 0 16px rgba(212,98,42,0.12), inset 0 0 20px rgba(212,98,42,0.04)'
          : '0 0 16px rgba(196,148,61,0.08), inset 0 0 20px rgba(196,148,61,0.03)',
      }}
    >
      {/* Corner accent */}
      <div
        className="pointer-events-none absolute left-0 top-0 h-8 w-0.5"
        style={{ background: isLowHp ? 'var(--furnace)' : 'var(--brass)', opacity: 0.8 }}
      />
      <div
        className="pointer-events-none absolute left-0 top-0 h-0.5 w-8"
        style={{ background: isLowHp ? 'var(--furnace)' : 'var(--brass)', opacity: 0.8 }}
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 h-6 w-0.5"
        style={{ background: isLowHp ? 'var(--furnace)' : 'var(--brass)', opacity: 0.3 }}
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 h-0.5 w-6"
        style={{ background: isLowHp ? 'var(--furnace)' : 'var(--brass)', opacity: 0.3 }}
      />

      {/* Top strip: YOU badge + status */}
      <div
        className="flex items-center justify-between px-3 pt-2.5"
      >
        <div className="flex items-center gap-1.5">
          <span
            className="text-[8px] font-bold uppercase tracking-[0.3em] px-1.5 py-0.5"
            style={{
              fontFamily: 'var(--font-mono), monospace',
              background: isLowHp ? 'rgba(212,98,42,0.15)' : 'rgba(196,148,61,0.12)',
              border: `1px solid ${isLowHp ? 'rgba(212,98,42,0.4)' : 'rgba(196,148,61,0.3)'}`,
              color: isLowHp ? 'var(--furnace)' : 'var(--brass)',
            }}
          >
            You
          </span>
          {player.is_host && (
            <span
              className="text-[8px] uppercase tracking-[0.2em] px-1.5 py-0.5"
              style={{
                fontFamily: 'var(--font-mono), monospace',
                background: 'rgba(90,122,109,0.12)',
                border: '1px solid rgba(90,122,109,0.3)',
                color: 'var(--patina)',
              }}
            >
              Host
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: player.status === 'active' ? 'var(--patina)' : 'var(--ash)',
              boxShadow: player.status === 'active' ? '0 0 5px var(--patina)' : 'none',
            }}
          />
          <span
            className="text-[8px] uppercase tracking-[0.15em]"
            style={{
              fontFamily: 'var(--font-mono), monospace',
              color: player.status === 'active' ? 'var(--patina)' : 'var(--ash)',
            }}
          >
            {player.status}
          </span>
        </div>
      </div>

      {/* Avatar + identity row */}
      <div className="flex items-center gap-3 px-3 pt-2 pb-1">
        <div
          className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden"
          style={{
            background: isLowHp
              ? 'radial-gradient(circle at 35% 35%, rgba(212,98,42,0.18), rgba(26,24,20,0.95))'
              : 'radial-gradient(circle at 35% 35%, rgba(196,148,61,0.15), rgba(26,24,20,0.95))',
            border: `1px solid ${isLowHp ? 'rgba(212,98,42,0.5)' : 'rgba(196,148,61,0.4)'}`,
            clipPath: 'polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px)',
          }}
        >
          <span
            className="text-xl font-bold"
            style={{
              fontFamily: 'var(--font-display), sans-serif',
              color: isLowHp ? 'var(--furnace)' : 'var(--brass)',
              textShadow: `0 0 12px ${isLowHp ? 'rgba(212,98,42,0.6)' : 'rgba(196,148,61,0.5)'}`,
            }}
          >
            {displayName[0].toUpperCase()}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className="truncate text-sm font-bold uppercase tracking-[0.06em] text-steam leading-tight"
            style={{ fontFamily: 'var(--font-heading), serif' }}
          >
            {displayName}
          </span>
          <span
            className="truncate text-[10px] uppercase tracking-[0.18em]"
            style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--copper)' }}
          >
            {player.character_class ?? 'Unknown'}
          </span>
        </div>
      </div>

      {/* HP section */}
      <div className="px-3 pb-3 pt-1 flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span
            className="text-[9px] uppercase tracking-[0.2em] text-ash/50"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            HP
          </span>
          <div className="flex items-baseline gap-0.5">
            <span
              className="text-lg font-bold leading-none tabular-nums"
              style={{
                fontFamily: 'var(--font-mono), monospace',
                color: hpColor,
                textShadow: `0 0 10px ${hpColor}55`,
              }}
            >
              {hp}
            </span>
            <span
              className="text-[10px] text-ash/40"
              style={{ fontFamily: 'var(--font-mono), monospace' }}
            >
              /{hpMax}
            </span>
          </div>
        </div>
        <HpBar hp={hp} hpMax={hpMax} thick />
        {isLowHp && (
          <div className="flex items-center gap-1 mt-0.5">
            <div
              className="h-1 w-1 rounded-full"
              style={{ background: 'var(--furnace)', animation: 'pulse 1.5s ease-in-out infinite' }}
            />
            <span
              className="text-[8px] uppercase tracking-[0.2em]"
              style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--furnace)' }}
            >
              Critical
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Other Player Row ─────────────────────────────────────────────────────────
// Compact row for party members (not the current user).

function OtherPlayerRow({ player }: { player: Player }) {
  const hp = player.stats.hp;
  const hpMax = player.stats.hp_max;
  const hpPct = Math.max(0, Math.min(100, (hp / hpMax) * 100));
  const hpColor = hpPct > 60 ? 'var(--patina)' : hpPct > 25 ? 'var(--amber)' : 'var(--furnace)';
  const isLowHp = hpPct < 25;
  const displayName = player.character_name ?? player.username;

  return (
    <div
      className="relative flex flex-col gap-1.5 p-2.5 transition-all duration-300"
      style={{
        background: 'rgba(26,24,20,0.6)',
        border: `1px solid ${isLowHp ? 'rgba(212,98,42,0.3)' : 'rgba(61,54,48,0.8)'}`,
      }}
    >
      <div className="flex items-center gap-2">
        {/* Small avatar */}
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center"
          style={{
            background: 'var(--smog)',
            border: '1px solid var(--gunmetal)',
            clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)',
          }}
        >
          <span
            className="text-xs font-bold text-ash"
            style={{ fontFamily: 'var(--font-display), sans-serif' }}
          >
            {displayName[0].toUpperCase()}
          </span>
        </div>

        {/* Name + class */}
        <div className="flex min-w-0 flex-1 flex-col gap-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-steam leading-tight"
              style={{ fontFamily: 'var(--font-heading), serif' }}
            >
              {displayName}
            </span>
            {player.is_host && (
              <div className="flex shrink-0 h-3 w-3 items-center justify-center bg-brass">
                <span className="text-[6px] font-bold text-soot">H</span>
              </div>
            )}
          </div>
          <span
            className="text-[9px] uppercase tracking-[0.12em] text-ash/50 leading-tight"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            {player.character_class ?? 'Unknown'}
          </span>
        </div>

        {/* HP value */}
        <div className="flex shrink-0 items-baseline gap-0.5">
          <span
            className="text-xs font-bold tabular-nums leading-none"
            style={{ fontFamily: 'var(--font-mono), monospace', color: hpColor }}
          >
            {hp}
          </span>
          <span
            className="text-[9px] text-ash/35"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            /{hpMax}
          </span>
        </div>

        {/* Status dot */}
        <div
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{
            background: player.status === 'active' ? 'var(--patina)' : 'var(--ash)',
            boxShadow: player.status === 'active' ? '0 0 4px var(--patina)' : 'none',
          }}
        />
      </div>

      {/* HP bar */}
      <HpBar hp={hp} hpMax={hpMax} />
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
          <span
            className="font-bold text-ash"
            style={{
              fontSize: compact ? '0.875rem' : '1rem',
              fontFamily: 'var(--font-display), sans-serif'
            }}
          >
            {(player.character_name ?? player.username)[0].toUpperCase()}
          </span>
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

// ─── Section Label ────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className="h-px flex-1 bg-gradient-to-r from-brass/30 to-transparent" />
      <span
        className="text-[9px] uppercase tracking-[0.25em] text-brass/60"
        style={{ fontFamily: 'var(--font-mono), monospace' }}
      >
        {label}
      </span>
      <div className="h-px flex-1 bg-gradient-to-l from-brass/30 to-transparent" />
    </div>
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
  const me = players.find((p) => p.user_id === currentUserId);
  const others = players.filter((p) => p.user_id !== currentUserId);

  return (
    <aside
      className="relative z-10 hidden w-56 shrink-0 flex-col border-r border-gunmetal bg-iron/80 lg:flex"
      style={{ backdropFilter: 'blur(4px)' }}
    >
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {/* ── My player ── */}
        {me && (
          <div className="flex flex-col gap-1.5">
            <SectionLabel label={me.character_name ?? me.username} />
            <PlayerCard player={me} isCurrentUser compact />
          </div>
        )}

        {/* ── Party ── */}
        {others.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <SectionLabel label="Party" />
            {others.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                isCurrentUser={false}
                compact
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
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
  onImageClick,
  coverImageUrl
}: {
  world: World;
  onImageClick: (state: ImageModalState) => void;
  coverImageUrl: string | null;
}) {
  const seen = new Set<string>();
  const galleryImages: { url: string; caption: string }[] = [
    coverImageUrl ? { url: coverImageUrl, caption: `${world.name} — Campaign` } : null,
    world.map_url ? { url: world.map_url, caption: `${world.name} — Map` } : null,
    world.cover_url ? { url: world.cover_url, caption: `${world.name} — Cover` } : null
  ].filter((item): item is { url: string; caption: string } => {
    if (!item) return false;
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
  return (
    <aside
      className="relative z-10 hidden w-56 shrink-0 flex-col border-l border-gunmetal bg-iron/80 lg:flex"
      style={{ backdropFilter: 'blur(4px)' }}
    >
      {/* Campaign cover image — clickable, falls back to world cover */}
      <button
        onClick={() =>
          coverImageUrl && onImageClick({ url: coverImageUrl, caption: world.name })
        }
        className="group relative overflow-hidden border-b border-gunmetal"
        style={{ cursor: coverImageUrl ? 'pointer' : 'default' }}
      >
        {coverImageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverImageUrl}
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
        {galleryImages.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {galleryImages.map(({ url, caption }) => (
              <GalleryThumb
                key={url}
                imageUrl={url}
                onClick={() => onImageClick({ url, caption })}
              />
            ))}
          </div>
        ) : (
          <p
            className="text-[9px] uppercase tracking-[0.1em] text-ash/30"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            No visions recorded yet
          </p>
        )}
      </div>
    </aside>
  );
}

// ─── Desktop Action Console ────────────────────────────────────────────────────

export function DesktopActionConsole({
  value,
  onChange,
  onSend,
  disabled,
  debounceStartedAt,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: (content: string) => void;
  disabled?: boolean;
  debounceStartedAt?: number | null;
}) {
  const handleSend = () => {
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    onChange('');
  };

  return (
    <div
      className="hidden border-t border-gunmetal bg-iron/70 px-6 py-4 lg:block"
      style={{ backdropFilter: 'blur(4px)' }}
    >
      <div className="mx-auto max-w-3xl">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-px w-6 bg-gradient-to-r from-transparent to-copper/60" />
            <span
              className="text-[9px] uppercase tracking-[0.25em] text-copper/70"
              style={{ fontFamily: 'var(--font-mono), monospace' }}
            >
              Action Console
            </span>
          </div>
          {debounceStartedAt != null && (
            <DebounceTimer startedAt={debounceStartedAt} />
          )}
        </div>
        <div className="flex gap-3">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
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
            onClick={handleSend}
            disabled={disabled}
            className="flex shrink-0 flex-col items-center justify-center gap-1 px-6 py-3 text-soot transition-all duration-300 hover:shadow-[0_0_20px_rgba(196,148,61,0.4)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
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
      </div>
    </div>
  );
}

// ─── Active Game View ──────────────────────────────────────────────────────────

function ActiveGameView({
  campaign,
  world,
  players,
  liveMessages,
  optimisticMessages,
  lastActionSentAt,
  streamingContent,
  isStreaming,
  currentUserId,
  campaignCoverImageUrl: initialCampaignCoverImageUrl,
  wsStatus,
  isSilentReconnect,
  onSend,
  voiceNarration,
}: {
  campaign: Campaign;
  world: World;
  players: Player[];
  liveMessages: Message[];
  optimisticMessages: OptimisticMessage[];
  lastActionSentAt: number | null;
  streamingContent: string;
  isStreaming: boolean;
  currentUserId: string;
  campaignCoverImageUrl?: string;
  wsStatus: 'connecting' | 'connected' | 'disconnected';
  isSilentReconnect: boolean;
  onSend: (content: string) => void;
  voiceNarration: UseVoiceNarration;
}) {
  const feedRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [mobileInputExpanded, setMobileInputExpanded] = useState(false);
  const [imageModal, setImageModal] = useState<ImageModalState | null>(null);
  const [liveCoverUrl, setLiveCoverUrl] = useState<string | undefined>(
    initialCampaignCoverImageUrl
  );

  // Subscribe to image updates
  useEffect(() => {
    const supabase = createClient();

    const imageChannel = supabase
      .channel(`world:${world.id}`)
      .on(
        'broadcast',
        { event: 'image:ready' },
        (message: {
          payload: {
            entity_type: string;
            entity_id: string;
            image_type: string;
            url: string;
            image_id: string;
          };
        }) => {
          const { entity_type, entity_id, image_type, url } = message.payload;
          if (entity_type === 'campaign' && entity_id === campaign.id) {
            setLiveCoverUrl(url);
          } else if (
            entity_type === 'world' &&
            entity_id === world.id &&
            image_type === 'cover'
          ) {
            setLiveCoverUrl(url);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(imageChannel);
    };
  }, [campaign.id, world.id]);

  const displayModal = imageModal;

  const debounceStartedAt = !isStreaming ? lastActionSentAt : null;

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [liveMessages, optimisticMessages, streamingContent, mobileInputExpanded, debounceStartedAt]);

  // Convert optimistic messages to Message shape for rendering
  const optimisticAsMessages: Message[] = optimisticMessages.map((m) => ({
    id: m.id,
    campaign_id: campaign.id,
    player_id: m.playerId,
    content: m.content,
    type: 'action' as const,
    created_at: new Date(m.timestamp).toISOString()
  }));

  const handlePanelToggle = (panel: MobilePanel) =>
    setMobilePanel((prev) => (prev === panel ? null : panel));
  const handleImageClick = (state: ImageModalState) => setImageModal(state);
  const handleModalClose = () => setImageModal(null);
  const showConnectionBanner = !isSilentReconnect && wsStatus !== 'connected';
  const promptDisabled = wsStatus !== 'connected' && !isSilentReconnect;

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
            {/* Voice controls */}
            {voiceNarration.lastText && (
              <button
                onClick={() => voiceNarration.replay()}
                disabled={voiceNarration.isLoading || voiceNarration.isPlaying}
                title="Replay narration"
                className="flex h-7 w-7 items-center justify-center text-ash/60 transition-colors hover:text-steam disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RotateCcw
                  size={14}
                  className={voiceNarration.isLoading ? 'animate-spin' : ''}
                />
              </button>
            )}
            <button
              onClick={() => voiceNarration.toggle()}
              title={voiceNarration.enabled ? 'Disable voice narration' : 'Enable voice narration'}
              className="flex h-7 w-7 items-center justify-center text-ash/60 transition-colors hover:text-steam"
            >
              {voiceNarration.enabled ? (
                <Volume2 size={14} className={voiceNarration.isPlaying ? 'text-steam' : ''} />
              ) : (
                <VolumeX size={14} />
              )}
            </button>
            <div className="h-3 w-px bg-gunmetal" />
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
              Campaign Active
            </span>
          </div>
        </header>

        {/* Disconnected banner */}
        {showConnectionBanner && (
          <div
            className="flex items-center justify-center gap-2 border-b border-furnace/40 bg-furnace/10 px-4 py-1.5 text-[11px] text-furnace/80"
            style={{ fontFamily: 'var(--font-mono), monospace' }}
          >
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-furnace/80" />
            {wsStatus === 'connecting' ? 'Connecting...' : 'Reconnecting...'}
          </div>
        )}

        {/* Feed */}
        <div
          ref={feedRef}
          className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--gunmetal) transparent',
            paddingBottom: `calc(${
              56 + // tab bar
              (mobileInputExpanded ? 104 : 64) + // input area (expanded: 3 rows, collapsed: 1 row)
              (debounceStartedAt != null ? 64 : 0) // debounce timer bar
            }px + env(safe-area-inset-bottom, 0px))`
          }}
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-5 sm:gap-6">
            {(() => {
              // Group consecutive narration messages under one header
              const allMessages = [...liveMessages, ...optimisticAsMessages];
              const items: React.ReactNode[] = [];
              let i = 0;
              while (i < allMessages.length) {
                const msg = allMessages[i];
                if (msg.type === 'narration') {
                  const group: Message[] = [];
                  while (i < allMessages.length && allMessages[i].type === 'narration') {
                    group.push(allMessages[i]);
                    i++;
                  }
                  items.push(<NarrationGroupBubble key={group[0].id} messages={group} />);
                } else {
                  items.push(
                    <MessageBubble key={msg.id} message={msg} players={players} />
                  );
                  i++;
                }
              }
              return items;
            })()}
            {/* Streaming narration */}
            {streamingContent && (
              <MessageBubble
                key="streaming"
                message={{
                  id: 'streaming',
                  campaign_id: campaign.id,
                  player_id: null,
                  content: streamingContent,
                  type: 'narration',
                  created_at: new Date().toISOString()
                }}
                players={players}
              />
            )}
            {/* GM typing indicator — shown when debounce fired but streaming hasn't started yet */}
            {isStreaming && !streamingContent && (
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
            )}
          </div>
        </div>

        <DesktopActionConsole
          value={inputValue}
          onChange={setInputValue}
          onSend={onSend}
          disabled={promptDisabled}
          debounceStartedAt={debounceStartedAt}
        />
      </main>

      {/* Desktop right */}
      <DesktopRightSidebar
        world={world}
        onImageClick={handleImageClick}
        coverImageUrl={liveCoverUrl ?? null}
      />

      {/* Mobile UI */}
      <MobileActionBar
        value={inputValue}
        onChange={setInputValue}
        onSend={onSend}
        disabled={promptDisabled}
        debounceStartedAt={debounceStartedAt}
        onExpandedChange={setMobileInputExpanded}
      />
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
          {(() => {
            const me = players.find((p) => p.user_id === currentUserId);
            const others = players.filter((p) => p.user_id !== currentUserId);
            return (
              <>
                {me && (
                  <div className="flex flex-col gap-1.5">
                    <SectionLabel label={me.character_name ?? me.username} />
                    <PlayerCard player={me} isCurrentUser />
                  </div>
                )}
                {others.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <SectionLabel label="Party" />
                    {others.map((player) => (
                      <PlayerCard key={player.id} player={player} isCurrentUser={false} />
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </MobilePanel>

      {/* Mobile world panel */}
      <MobilePanel
        open={mobilePanel === 'log'}
        title="Expedition Log"
        onClose={() => setMobilePanel(null)}
      >
        {/* Campaign cover image — clickable, falls back to world cover */}
        <button
          onClick={() => {
            const url = liveCoverUrl;
            if (url) handleImageClick({ url, caption: world.name });
          }}
          className="group relative mb-4 block w-full overflow-hidden border border-gunmetal"
          style={{
            clipPath:
              'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
            cursor: liveCoverUrl ? 'pointer' : 'default'
          }}
        >
          {liveCoverUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={liveCoverUrl!}
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
        {(() => {
          const mobileSeen = new Set<string>();
          const mobileGallery: { url: string; caption: string }[] = [
            liveCoverUrl
              ? { url: liveCoverUrl, caption: `${world.name} — Campaign` }
              : null,
            world.map_url ? { url: world.map_url, caption: `${world.name} — Map` } : null,
            world.cover_url
              ? { url: world.cover_url, caption: `${world.name} — Cover` }
              : null
          ].filter((item): item is { url: string; caption: string } => {
            if (!item) return false;
            if (mobileSeen.has(item.url)) return false;
            mobileSeen.add(item.url);
            return true;
          });
          return mobileGallery.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {mobileGallery.map(({ url, caption }) => (
                <GalleryThumb
                  key={url}
                  imageUrl={url}
                  onClick={() => handleImageClick({ url, caption })}
                />
              ))}
            </div>
          ) : (
            <p
              className="text-[10px] uppercase tracking-[0.1em] text-ash/30"
              style={{ fontFamily: 'var(--font-mono), monospace' }}
            >
              No visions recorded yet
            </p>
          );
        })()}
      </MobilePanel>

      {/* Image Modal */}
      {displayModal && <ImageModal modal={displayModal} onClose={handleModalClose} />}
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
  loadingImageUrl,
  campaignCoverImageUrl
}: GameClientProps) {
  const gameAlreadyStarted = dbMessages.length > 0;

  const [viewState, setViewState] = useState<GameViewState>(
    gameAlreadyStarted ? 'active' : 'loading'
  );

  const [liveMessages, setLiveMessages] = useState<Message[]>(
    [...dbMessages].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  );
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);
  const [lastActionSentAt, setLastActionSentAt] = useState<number | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const streamingContentRef = useRef('');
  const [isStreaming, setIsStreaming] = useState(false);
  const voiceNarration = useVoiceNarration();
  const voiceNarrationRef = useRef(voiceNarration);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>(
    'connecting'
  );
  const [isSilentReconnect, setIsSilentReconnect] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const optimisticMessagesRef = useRef<OptimisticMessage[]>([]);

  const currentPlayer = dbPlayers.find((p) => p.user_id === currentUserId);
  const playerName =
    currentPlayer?.character_name ?? currentPlayer?.username ?? 'Unknown';

  useEffect(() => {
    optimisticMessagesRef.current = optimisticMessages;
  }, [optimisticMessages]);

  // Sync ref on every render so the long-lived WS useEffect always has fresh
  // function references without needing to re-run and reconnect.
  voiceNarrationRef.current = voiceNarration;

  // WebSocket connection with exponential-backoff reconnection
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let unmounted = false;
    // Suppress banner/disable during cold-start restarts (close code 1006)
    let silentReconnect = false;

    const scheduleReconnect = (silent = false) => {
      if (unmounted) return;
      silentReconnect = silent;
      setIsSilentReconnect(silent);
      if (!silent) setWsStatus('disconnected');
      const delay = Math.min(1000 * 2 ** reconnectAttempt, 30000);
      reconnectAttempt++;
      console.log(
        `[game-session] reconnecting in ${delay}ms (attempt ${reconnectAttempt})${silent ? ' [silent]' : ''}`
      );
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, delay);
    };

    const connect = async () => {
      if (unmounted) return;
      if (!silentReconnect) setWsStatus('connecting');
      console.log('[game-session] connecting… (attempt', reconnectAttempt + 1, ')');

      const supabase = createClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (unmounted) return;
      if (!session?.access_token) {
        console.warn('[game-session] no session — retrying');
        scheduleReconnect();
        return;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const socketConfig = buildGameSessionSocketConfig({
        supabaseUrl,
        campaignId: campaign.id,
        accessToken: session.access_token
      });

      ws = new WebSocket(socketConfig.url, socketConfig.protocols);
      wsRef.current = ws;

      ws.onopen = () => {
        const socket = ws;
        if (!socket) return;
        const shouldReplayOptimistic = silentReconnect;
        reconnectAttempt = 0;
        silentReconnect = false;
        setIsSilentReconnect(false);
        setWsStatus('connected');
        console.log('[game-session] connected');

        if (shouldReplayOptimistic) {
          const pendingOptimistic = optimisticMessagesRef.current.filter((message) => message.isOwn);
          for (const message of pendingOptimistic) {
            console.log('[game-session] replay optimistic action', {
              id: message.id,
              content: message.content
            });
            socket.send(
              JSON.stringify({
                type: 'action',
                id: message.id,
                content: message.content,
                timestamp: message.timestamp
              })
            );
          }
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        let msg: { type: string; [key: string]: unknown };
        try {
          msg = JSON.parse(event.data as string);
        } catch {
          return;
        }

        if (msg.type === 'chunk') {
          setIsStreaming(true);
          setLastActionSentAt(null);
          setStreamingContent((prev) =>
            appendStreamingContent(streamingContentRef, prev, msg.content as string)
          );
          setViewState((prev) => (prev === 'loading' ? 'active' : prev));
        }

        if (msg.type === 'round:saved') {
          // Narration and action messages are delivered via Supabase Realtime
          // postgres_changes. This event only signals that streaming is done.
          console.log('[game-session] round:saved (streaming complete)');
          const textToSpeak = streamingContentRef.current;
          setIsStreaming(false);
          setStreamingContent('');
          if (textToSpeak) voiceNarrationRef.current.speak(textToSpeak);
        }

        if (msg.type === 'error') {
          console.error('[game-session] server error:', msg.message);
          // If we're still on the loading screen, the opening narration failed.
          // Transition to active so the player isn't stuck forever — the feed will
          // show empty and the GM typing indicator will be gone.
          setViewState((prev) => (prev === 'loading' ? 'active' : prev));
          setIsStreaming(false);
          setLastActionSentAt(null);
        }
      };

      ws.onclose = (event) => {
        const isColdRestart = event.code === 1006;
        console.log('[game-session] disconnected', {
          code: event.code,
          reason: event.reason || 'none',
          silent: isColdRestart
        });
        wsRef.current = null;
        if (unmounted) return;
        scheduleReconnect(isColdRestart);
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      voiceNarrationRef.current.stop();
    };
  }, [campaign.id]);

  // Supabase Realtime: subscribe to new message inserts for this campaign.
  // This is the primary delivery path for player actions and narration —
  // works across all edge function isolates, fixing the multiplayer isolation bug.
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`game-messages-${campaign.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `campaign_id=eq.${campaign.id}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          console.log('[realtime] messages INSERT', {
            id: newMsg.id,
            type: newMsg.type,
            client_id: newMsg.client_id,
          });

          // Remove matching optimistic message (own action confirmed by DB).
          if (newMsg.client_id) {
            setOptimisticMessages((prev) =>
              prev.filter((m) => m.id !== newMsg.client_id)
            );
          }

          // Start/restart the debounce timer for all players when any action lands.
          if (newMsg.type === 'action') {
            setLastActionSentAt(new Date(newMsg.created_at).getTime());
          }

          // Add to live messages (dedup by id).
          setLiveMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg].sort(
              (a, b) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });

          // Transition loading → active when the first narration arrives.
          if (newMsg.type === 'narration') {
            setViewState((prev) => (prev === 'loading' ? 'active' : prev));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campaign.id]);

  const handleSend = (content: string) => {
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const ws = wsRef.current;
    const canSendNow = ws?.readyState === WebSocket.OPEN && wsStatus === 'connected';
    const canQueue = isSilentReconnect;

    if (!canSendNow && !canQueue) return;

    setOptimisticMessages((prev) => [
      ...prev,
      {
        id,
        playerId: currentPlayer?.id ?? '',
        playerName,
        content,
        timestamp,
        isOwn: true
      }
    ]);

    if (canSendNow && ws) {
      console.log('[game-session] send action', { id, content });
      ws.send(JSON.stringify({ type: 'action', id, content, timestamp }));
      return;
    }

    console.log('[game-session] hold optimistic action during silent reconnect', { id, content });
  };

  if (viewState === 'loading') {
    return (
      <LoadingState campaignName={campaign.name} backgroundImageUrl={loadingImageUrl} />
    );
  }

  return (
    <ActiveGameView
      campaign={campaign}
      world={world}
      players={dbPlayers}
      liveMessages={liveMessages}
      optimisticMessages={optimisticMessages}
      lastActionSentAt={lastActionSentAt}
      streamingContent={streamingContent}
      isStreaming={isStreaming}
      currentUserId={currentUserId}
      campaignCoverImageUrl={campaignCoverImageUrl}
      wsStatus={wsStatus}
      isSilentReconnect={isSilentReconnect}
      onSend={handleSend}
      voiceNarration={voiceNarration}
    />
  );
}
