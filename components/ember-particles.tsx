"use client";

// Simple seeded PRNG — deterministic across server/client
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface Ember {
  id: number;
  left: string;
  size: number;
  duration: string;
  delay: string;
  drift: string;
  opacity: number;
  color: string;
}

export function EmberParticles({ count = 25 }: { count?: number }) {
  const rand = seededRandom(42);
  const embers: Ember[] = Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${(rand() * 100).toFixed(4)}%`,
    size: +(1 + rand() * 3).toFixed(4),
    duration: `${(8 + rand() * 12).toFixed(4)}s`,
    delay: `${(-rand() * 20).toFixed(4)}s`,
    drift: `${(-30 + rand() * 60).toFixed(4)}px`,
    opacity: +(0.3 + rand() * 0.5).toFixed(4),
    color: rand() > 0.4 ? "var(--furnace)" : "var(--amber-glow)",
  }));

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[2] overflow-hidden"
      aria-hidden="true"
    >
      {embers.map((ember) => (
        <span
          key={ember.id}
          className="absolute bottom-0 rounded-full"
          style={{
            left: ember.left,
            width: `${ember.size}px`,
            height: `${ember.size}px`,
            backgroundColor: ember.color,
            boxShadow: `0 0 ${(ember.size * 3).toFixed(4)}px ${ember.color}`,
            opacity: 0,
            animationName: "ember-rise",
            animationDuration: ember.duration,
            animationDelay: ember.delay,
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
            ["--ember-drift" as string]: ember.drift,
            ["--ember-opacity" as string]: `${ember.opacity}`,
          }}
        />
      ))}
    </div>
  );
}
