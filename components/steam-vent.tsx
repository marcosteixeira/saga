"use client";

import { useMemo } from "react";

export function SteamVent({ puffs = 8 }: { puffs?: number }) {
  const vents = useMemo(
    () =>
      Array.from({ length: puffs }, (_, i) => ({
        id: i,
        left: `${10 + (i / (puffs - 1)) * 80}%`,
        delay: `${-Math.random() * 3}s`,
        duration: `${2.5 + Math.random() * 1.5}s`,
        size: 30 + Math.random() * 20,
      })),
    [puffs]
  );

  return (
    <div className="steam-vent-container" aria-hidden="true">
      {vents.map((v) => (
        <span
          key={v.id}
          className="steam-vent-puff"
          style={{
            left: v.left,
            width: v.size,
            height: v.size * 0.5,
            animationDelay: v.delay,
            animationDuration: v.duration,
          }}
        />
      ))}
    </div>
  );
}
