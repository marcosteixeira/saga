"use client";

// Simple seeded PRNG — deterministic across server/client
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function SteamVent({ puffs = 8 }: { puffs?: number }) {
  const rand = seededRandom(123);
  const vents = Array.from({ length: puffs }, (_, i) => ({
    id: i,
    left: `${(10 + (i / (puffs - 1)) * 80).toFixed(4)}%`,
    delay: `${(-rand() * 3).toFixed(4)}s`,
    duration: `${(2.5 + rand() * 1.5).toFixed(4)}s`,
    size: +(30 + rand() * 20).toFixed(4),
  }));

  return (
    <div className="steam-vent-container" aria-hidden="true">
      {vents.map((v) => (
        <span
          key={v.id}
          className="steam-vent-puff"
          style={{
            left: v.left,
            width: `${v.size}px`,
            height: `${(v.size * 0.5).toFixed(4)}px`,
            animationDelay: v.delay,
            animationDuration: v.duration,
          }}
        />
      ))}
    </div>
  );
}
