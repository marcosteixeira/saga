export default function GlobalLoading() {
  return (
    <main className="relative min-h-screen bg-soot flex items-center justify-center overflow-hidden">
      <div className="furnace-overlay" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />

      <div className="relative z-10 flex flex-col items-center gap-8">
        {/* Piston animation */}
        <div className="flex items-end gap-4" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="relative flex flex-col items-center gap-1"
              style={{ animationDelay: `${i * 0.3}s` }}
            >
              {/* Piston rod */}
              <div
                className="w-3 rounded-sm"
                style={{
                  height: '40px',
                  background: 'linear-gradient(180deg, var(--brass), var(--copper))',
                  boxShadow: '0 0 8px rgba(196,148,61,0.4)',
                  animation: `piston-pump 1.2s ease-in-out infinite`,
                  animationDelay: `${i * 0.4}s`,
                }}
              />
              {/* Piston head */}
              <div
                className="w-8 rounded-sm"
                style={{
                  height: '14px',
                  background: 'linear-gradient(135deg, var(--gunmetal), var(--ash), var(--gunmetal))',
                  border: '1px solid var(--brass)',
                }}
              />
              {/* Base */}
              <div
                className="w-10 rounded-sm"
                style={{
                  height: '8px',
                  background: 'var(--iron)',
                  border: '1px solid var(--gunmetal)',
                }}
              />
            </div>
          ))}
        </div>

        <p
          className="uppercase tracking-widest text-sm"
          style={{
            fontFamily: 'var(--font-body)',
            color: 'var(--ash)',
            letterSpacing: '0.2em',
          }}
        >
          Firing up the engines...
        </p>

        {/* Progress bar shimmer */}
        <div
          className="relative overflow-hidden rounded-none"
          style={{
            width: '200px',
            height: '4px',
            background: 'var(--gunmetal)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(90deg, transparent, var(--brass), transparent)',
              animation: 'skeleton-shimmer 1.5s linear infinite',
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes piston-pump {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-16px); }
        }
        @keyframes skeleton-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; }
        }
      `}</style>
    </main>
  )
}
