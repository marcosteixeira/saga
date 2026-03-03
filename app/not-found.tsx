import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="relative min-h-screen bg-soot flex items-center justify-center overflow-hidden">
      {/* Dense smog layers */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background: [
            'radial-gradient(ellipse 120% 60% at 50% 100%, rgba(212,98,42,0.04) 0%, transparent 70%)',
            'linear-gradient(180deg, rgba(13,12,10,0.8) 0%, transparent 40%, rgba(13,12,10,0.6) 100%)',
          ].join(', '),
        }}
      />

      {/* Smog overlay — dense */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 200% 80% at 50% 50%, var(--smog) 0%, transparent 70%)',
          animation: 'var(--animate-smog-drift)',
          ['--smog-speed' as string]: '50s',
        }}
      />

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

      {/* Reduced ember particles — inline SVG circles */}
      <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden" aria-hidden="true">
        {[
          { left: '15%', delay: '0s', dur: '18s' },
          { left: '35%', delay: '4s', dur: '22s' },
          { left: '55%', delay: '8s', dur: '16s' },
          { left: '75%', delay: '2s', dur: '20s' },
          { left: '90%', delay: '6s', dur: '24s' },
        ].map((e, i) => (
          <div
            key={i}
            className="absolute bottom-0 rounded-full"
            style={{
              left: e.left,
              width: '3px',
              height: '3px',
              background: 'var(--amber-glow)',
              boxShadow: '0 0 4px var(--amber-glow)',
              animation: `ember-rise ${e.dur} linear infinite`,
              animationDelay: e.delay,
              opacity: 0.6,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 text-center px-6 max-w-xl">
        <p
          className="mb-4 uppercase tracking-widest text-xs"
          style={{
            fontFamily: 'var(--font-body)',
            color: 'var(--ash)',
            letterSpacing: '0.2em',
          }}
        >
          Error 404
        </p>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2.5rem, 8vw, 5rem)',
            color: 'var(--ash)',
            textShadow: '0 0 40px rgba(107,93,82,0.4)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            lineHeight: 1.1,
            marginBottom: '1.5rem',
          }}
        >
          Lost in the Smog
        </h1>

        <div
          className="w-24 h-px mx-auto mb-6"
          style={{ background: 'linear-gradient(90deg, transparent, var(--gunmetal), transparent)' }}
        />

        <p
          className="mb-8 text-sm leading-relaxed"
          style={{ fontFamily: 'var(--font-body)', color: 'var(--ash)' }}
        >
          The fog has swallowed your destination. This passage does not appear on any foundry
          map. Perhaps the smog has obscured it, or it was never charted to begin with.
        </p>

        <Link
          href="/"
          className="inline-block uppercase tracking-widest text-sm transition-all duration-200"
          style={{
            fontFamily: 'var(--font-body)',
            color: 'var(--amber-glow)',
            letterSpacing: '0.12em',
            textDecoration: 'underline',
            textDecorationColor: 'rgba(232,168,53,0.4)',
            textUnderlineOffset: '4px',
          }}
        >
          ← Return through the fog
        </Link>
      </div>

      <style>{`
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; }
        }
      `}</style>
    </main>
  )
}
