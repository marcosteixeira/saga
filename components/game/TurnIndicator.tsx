'use client'

interface TurnIndicatorProps {
  submitted: number
  total: number
  timeRemaining: number
  timerSeconds: number
  allSubmitted: boolean
}

export default function TurnIndicator({
  submitted,
  total,
  timeRemaining,
  timerSeconds,
  allSubmitted,
}: TurnIndicatorProps) {
  const progress = timerSeconds > 0 ? timeRemaining / timerSeconds : 0
  const pct = Math.max(0, Math.min(100, progress * 100))

  const barColor =
    timeRemaining <= 10
      ? 'var(--furnace)'
      : timeRemaining <= 30
      ? 'var(--amber)'
      : 'var(--patina)'

  const glowStyle =
    timeRemaining <= 10
      ? { boxShadow: `0 0 8px ${barColor}`, animation: 'pulse 0.8s ease-in-out infinite' }
      : {}

  return (
    <div
      className="flex flex-col gap-1 px-3 py-2"
      style={{ fontFamily: 'var(--font-mono), monospace' }}
    >
      {/* Timer bar */}
      <div
        className="relative w-full rounded-sm overflow-hidden"
        style={{ height: '4px', background: 'var(--gunmetal)' }}
      >
        <div
          className="absolute left-0 top-0 h-full rounded-sm transition-all duration-1000"
          style={{ width: `${pct}%`, background: barColor, ...glowStyle }}
        />
      </div>

      {/* Status text */}
      <div className="flex items-center justify-between">
        <span
          className="text-xs uppercase tracking-widest"
          style={{ color: 'var(--ash)' }}
        >
          {allSubmitted
            ? 'AWAITING THE GAME MASTER...'
            : `${submitted}/${total} OPERATORS ACTED`}
        </span>
        {!allSubmitted && timerSeconds > 0 && (
          <span
            className="text-xs tabular-nums"
            style={{ color: barColor, ...glowStyle }}
          >
            {timeRemaining}s
          </span>
        )}
      </div>
    </div>
  )
}
