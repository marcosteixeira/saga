'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function CampaignError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  const isCampaignNotFound =
    error.message?.includes('not found') || error.message?.includes('404')
  const isSessionExpired =
    error.message?.includes('expired') || error.message?.includes('unauthorized')

  const heading = isCampaignNotFound
    ? 'Campaign Not Found'
    : isSessionExpired
    ? 'Session Expired'
    : 'System Failure'

  const body = isCampaignNotFound
    ? 'This campaign does not exist or has been dissolved. The records have been lost to the smog.'
    : isSessionExpired
    ? 'Your session has expired. Please return to the lobby and rejoin the campaign.'
    : 'A fault has interrupted the campaign machinery. You may attempt to restart or return to the lobby.'

  return (
    <main className="relative min-h-screen bg-soot flex items-center justify-center overflow-hidden">
      <div className="furnace-overlay" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />

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
        <h1
          className="font-display uppercase tracking-widest mb-4"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2rem, 6vw, 3.5rem)',
            color: 'var(--furnace)',
            textShadow: '0 0 60px rgba(212,98,42,0.6), 0 0 120px rgba(212,98,42,0.3)',
            letterSpacing: '0.15em',
          }}
        >
          {heading.toUpperCase()}
        </h1>

        <div
          className="w-24 h-px mx-auto mb-6"
          style={{ background: 'linear-gradient(90deg, transparent, var(--brass), transparent)' }}
        />

        <p
          className="mb-8 text-sm leading-relaxed"
          style={{ fontFamily: 'var(--font-body)', color: 'var(--steam)' }}
        >
          {body}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {!isCampaignNotFound && (
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
            >
              Try Again
            </button>
          )}

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
