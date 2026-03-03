"use client";

import { useMemo } from "react";

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
  const embers = useMemo<Ember[]>(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: 1 + Math.random() * 3,
      duration: `${8 + Math.random() * 12}s`,
      delay: `${-Math.random() * 20}s`,
      drift: `${-30 + Math.random() * 60}px`,
      opacity: 0.3 + Math.random() * 0.5,
      color: Math.random() > 0.4 ? "var(--furnace)" : "var(--amber-glow)",
    }));
  }, [count]);

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
            width: ember.size,
            height: ember.size,
            backgroundColor: ember.color,
            boxShadow: `0 0 ${ember.size * 3}px ${ember.color}`,
            opacity: 0,
            animationName: "ember-rise",
            animationDuration: ember.duration,
            animationDelay: ember.delay,
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
            ["--ember-drift" as string]: ember.drift,
            ["--ember-opacity" as string]: ember.opacity,
          }}
        />
      ))}
    </div>
  );
}
