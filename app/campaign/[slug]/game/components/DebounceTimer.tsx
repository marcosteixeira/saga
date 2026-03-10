'use client';

import { useState, useEffect } from 'react';
import { ROUND_DEBOUNCE_SECONDS as TOTAL_SECONDS } from '@/lib/game-session/config';
const SIZE = 52;
const CENTER = SIZE / 2;
const R = 18;
const CIRCUMFERENCE = 2 * Math.PI * R;

export function DebounceTimer({
  startedAt,
  showLabel = true,
}: {
  startedAt: number;
  showLabel?: boolean;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, TOTAL_SECONDS - (Date.now() - startedAt) / 1000)
  );

  useEffect(() => {
    const tick = () =>
      setRemaining(Math.max(0, TOTAL_SECONDS - (Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 80);
    return () => clearInterval(id);
  }, [startedAt]);

  const pct = remaining / TOTAL_SECONDS;
  const dashOffset = CIRCUMFERENCE * (1 - pct);
  const displaySeconds = Math.ceil(remaining);
  const urgent = remaining <= 2;
  const nearEnd = remaining <= 4;

  const strokeColor = urgent ? 'var(--furnace)' : nearEnd ? 'var(--amber-glow)' : 'var(--brass)';
  const glowColor = urgent ? '#d4622a' : nearEnd ? '#e8a835' : '#c4943d';
  const glowSize = urgent ? 6 : 3;

  return (
    <div
      className="flex items-center gap-2"
      style={{
        animation: urgent ? 'debounceUrgent 0.65s ease-in-out infinite alternate' : 'none',
      }}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ flexShrink: 0, overflow: 'visible' }}
      >
        {/* Dark backing plate with clipped corners feel */}
        <circle cx={CENTER} cy={CENTER} r={R + 4} fill="rgba(10,9,8,0.85)" />

        {/* Outer decorative ring */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={R + 3}
          fill="none"
          stroke="var(--gunmetal)"
          strokeWidth="0.5"
          strokeDasharray="2 3"
        />

        {/* Track ring */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={R}
          fill="none"
          stroke="var(--iron)"
          strokeWidth="3"
        />

        {/* Progress arc */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={R}
          fill="none"
          stroke={strokeColor}
          strokeWidth="3"
          strokeLinecap="butt"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
          style={{
            transition: 'stroke-dashoffset 0.08s linear, stroke 0.4s ease',
            filter: `drop-shadow(0 0 ${glowSize}px ${glowColor}bb)`,
          }}
        />

        {/* 8 second tick marks — sit just outside the progress ring */}
        {Array.from({ length: TOTAL_SECONDS }).map((_, i) => {
          const angle = ((i / TOTAL_SECONDS) * 2 * Math.PI) - Math.PI / 2;
          const outerR = R + 6;
          const innerR = R + 4;
          const x1 = CENTER + outerR * Math.cos(angle);
          const y1 = CENTER + outerR * Math.sin(angle);
          const x2 = CENTER + innerR * Math.cos(angle);
          const y2 = CENTER + innerR * Math.sin(angle);
          const lit = i < Math.round(remaining);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={lit ? strokeColor : 'var(--gunmetal)'}
              strokeWidth="1.5"
              strokeLinecap="round"
              style={{
                transition: 'stroke 0.15s ease',
                filter: lit && urgent ? `drop-shadow(0 0 3px ${glowColor})` : 'none',
              }}
            />
          );
        })}

        {/* Inner hex frame — 6-sided decorative ring */}
        <polygon
          points={Array.from({ length: 6 })
            .map((_, i) => {
              const a = ((i / 6) * 2 * Math.PI) - Math.PI / 6;
              return `${CENTER + 10 * Math.cos(a)},${CENTER + 10 * Math.sin(a)}`;
            })
            .join(' ')}
          fill="none"
          stroke={strokeColor}
          strokeWidth="0.75"
          style={{
            transition: 'stroke 0.4s ease',
            opacity: 0.4,
          }}
        />

        {/* Center glow wash */}
        {urgent && (
          <circle
            cx={CENTER}
            cy={CENTER}
            r={9}
            fill={glowColor}
            opacity="0.08"
          />
        )}

        {/* Center countdown number */}
        <text
          x={CENTER}
          y={CENTER + 0.75}
          textAnchor="middle"
          dominantBaseline="central"
          fill={strokeColor}
          fontSize="13"
          fontWeight="700"
          fontFamily="var(--font-mono), monospace"
          style={{
            filter: urgent ? `drop-shadow(0 0 8px ${glowColor})` : 'none',
            transition: 'fill 0.4s ease',
          }}
        >
          {displaySeconds}
        </text>
      </svg>

      {showLabel && (
        <div className="flex flex-col gap-0.5" style={{ minWidth: '100px' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono), monospace',
              fontSize: '9px',
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              lineHeight: 1,
              color: urgent ? 'var(--furnace)' : 'var(--steam)',
              transition: 'color 0.3s',
            }}
          >
            {urgent ? 'Transmitting' : 'Round seals in'}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono), monospace',
              fontSize: '8px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              lineHeight: 1,
              color: 'var(--ash)',
              opacity: 0.5,
            }}
          >
            {urgent ? 'GM now reading' : 'send to lock early'}
          </span>
        </div>
      )}

      <style>{`
        @keyframes debounceUrgent {
          from { opacity: 1; }
          to   { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
