'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="relative min-h-screen bg-soot flex items-center justify-center overflow-hidden">
      {/* Furnace glow */}
      <div className="furnace-overlay" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />

      {/* Gear decoration — low opacity background */}
      <div
        className="pointer-events-none absolute bottom-0 right-0 opacity-5"
        aria-hidden="true"
      >
        <svg
          width="400"
          height="400"
          viewBox="0 0 400 400"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            animation: 'var(--animate-gear-spin)',
            ['--gear-speed' as string]: '80s',
          }}
        >
          <circle cx="200" cy="200" r="160" stroke="var(--brass)" strokeWidth="8" fill="none" />
          <circle cx="200" cy="200" r="60" stroke="var(--brass)" strokeWidth="6" fill="none" />
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30 * Math.PI) / 180
            const x1 = 200 + 60 * Math.cos(angle)
            const y1 = 200 + 60 * Math.sin(angle)
            const x2 = 200 + 160 * Math.cos(angle)
            const y2 = 200 + 160 * Math.sin(angle)
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--brass)" strokeWidth="4" />
            )
          })}
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30 * Math.PI) / 180
            const outerR = 175
            const toothW = 12
            const x = 200 + outerR * Math.cos(angle)
            const y = 200 + outerR * Math.sin(angle)
            return (
              <rect
                key={i}
                x={x - toothW / 2}
                y={y - toothW / 2}
                width={toothW}
                height={toothW}
                fill="var(--brass)"
                transform={`rotate(${i * 30}, ${x}, ${y})`}
              />
            )
          })}
        </svg>
      </div>

      {/* Noise texture */}
      <div
        className="pointer-events-none absolute inset-0 z-[1] opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 text-center px-6 max-w-lg">
        {/* Display heading */}
        <h1
          className="font-display uppercase tracking-widest mb-4"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.5rem, 8vw, 5rem)',
            color: 'var(--furnace)',
            textShadow: '0 0 60px rgba(212,98,42,0.6), 0 0 120px rgba(212,98,42,0.3)',
            letterSpacing: '0.15em',
          }}
        >
          SYSTEM FAILURE
        </h1>

        <div
          className="w-24 h-px mx-auto mb-6"
          style={{ background: 'linear-gradient(90deg, transparent, var(--brass), transparent)' }}
        />

        <p
          className="mb-2 text-lg uppercase tracking-widest"
          style={{ fontFamily: 'var(--font-body)', color: 'var(--steam)', letterSpacing: '0.12em' }}
        >
          The machinery has seized
        </p>

        <p
          className="mb-8 text-sm"
          style={{ fontFamily: 'var(--font-body)', color: 'var(--ash)' }}
        >
          A critical fault has been detected in the foundry systems. The engineers have been
          notified. You may attempt to restart the mechanisms below.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 uppercase tracking-widest text-sm font-semibold transition-all duration-200"
            style={{
              fontFamily: 'var(--font-body)',
              background: 'linear-gradient(135deg, var(--copper), var(--brass), var(--copper))',
              color: 'var(--soot)',
              border: 'none',
              letterSpacing: '0.12em',
              boxShadow: '0 0 20px rgba(196,148,61,0.3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 0 30px rgba(212,98,42,0.5)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 0 20px rgba(196,148,61,0.3)'
            }}
          >
            Try Again
          </button>

          <Link
            href="/"
            className="px-6 py-3 uppercase tracking-widest text-sm font-semibold transition-all duration-200 text-center"
            style={{
              fontFamily: 'var(--font-body)',
              background: 'transparent',
              color: 'var(--brass)',
              border: '1px solid var(--gunmetal)',
              letterSpacing: '0.12em',
            }}
          >
            Return to Lobby
          </Link>
        </div>
      </div>
    </main>
  )
}
