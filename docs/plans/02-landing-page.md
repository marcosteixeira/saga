# Steampunk Design System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current placeholder styling with the full "Golden Hour Foundry" Industrial Steampunk design system, covering fonts, colors, CSS custom properties, component classes, atmospheric effects (particles, smoke, gears), and the landing page.

**Architecture:** Complete rewrite of `globals.css` with new color tokens and component classes. New Google Fonts in `layout.tsx`. New React components for atmospheric effects (ember particles, ambient smoke, SVG gears). Landing page rebuilt with the new design system. shadcn button/input restyled via CSS variable overrides.

**Tech Stack:** Next.js 16 (App Router), Tailwind CSS v4, Google Fonts (Pragati Narrow, Rokkitt, Barlow Condensed, Share Tech Mono), CSS animations, SVG, React client components.

**Design spec:** `docs/plans/2026-03-03-steampunk-design-system.md`

---

### Task 1: Replace Google Fonts in layout.tsx

**Files:**
- Modify: `app/layout.tsx`

**Step 1: Update font imports and configuration**

Replace the current Cinzel Decorative + EB Garamond with the new 4-font stack:

```tsx
import type { Metadata } from "next";
import {
  Pragati_Narrow,
  Rokkitt,
  Barlow_Condensed,
  Share_Tech_Mono,
} from "next/font/google";
import "./globals.css";

const pragatiNarrow = Pragati_Narrow({
  weight: "700",
  subsets: ["latin"],
  variable: "--font-display",
});

const rokkitt = Rokkitt({
  weight: ["500", "700"],
  subsets: ["latin"],
  variable: "--font-heading",
});

const barlowCondensed = Barlow_Condensed({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-body",
});

const shareTechMono = Share_Tech_Mono({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Saga",
  description:
    "AI-powered tabletop RPG — gather your party, let the AI Game Master guide your adventure through dark fantasy realms.",
  openGraph: {
    title: "Saga",
    description:
      "AI-powered tabletop RPG — gather your party, let the AI Game Master guide your adventure.",
    images: ["/images/saga-og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${pragatiNarrow.variable} ${rokkitt.variable} ${barlowCondensed.variable} ${shareTechMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
```

**Step 2: Verify the dev server starts without errors**

Run: `yarn dev`
Expected: No font loading errors, page renders (will look broken — that's fine, CSS is next)

**Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: replace fonts with industrial steampunk stack (Pragati Narrow, Rokkitt, Barlow Condensed, Share Tech Mono)"
```

---

### Task 2: Rewrite globals.css — color tokens, theme inline, base styles

**Files:**
- Modify: `app/globals.css`

This is the largest task. Replace the entire file with the new design system foundations.

**Step 1: Write the new globals.css**

Replace the entire contents of `app/globals.css` with:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

/* ═══════════════════════════════════════════
   TAILWIND THEME INLINE
   Maps CSS vars to Tailwind utility classes
   ═══════════════════════════════════════════ */

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-body);
  --font-display: var(--font-display);
  --font-heading: var(--font-heading);
  --font-body: var(--font-body);
  --font-mono: var(--font-mono);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);
  --radius-3xl: calc(var(--radius) + 12px);
  --radius-4xl: calc(var(--radius) + 16px);
  /* Steampunk-specific color utilities */
  --color-soot: var(--soot);
  --color-iron: var(--iron);
  --color-smog: var(--smog);
  --color-gunmetal: var(--gunmetal);
  --color-ash: var(--ash);
  --color-brass: var(--brass);
  --color-copper: var(--copper);
  --color-amber: var(--amber-glow);
  --color-furnace: var(--furnace);
  --color-steam: var(--steam);
  --color-patina: var(--patina);
  --color-sky-slate: var(--sky-slate);
  /* Animations */
  --animate-fade-in-up: fadeInUp 0.7s ease-out both;
  --animate-steam-rise: steam-rise var(--steam-duration, 16s) linear infinite;
  --animate-ember-rise: ember-rise var(--ember-duration, 14s) linear infinite;
  --animate-furnace-glow: furnace-pulse 4s ease-in-out infinite;
  --animate-gear-spin: gear-spin var(--gear-speed, 60s) linear infinite;
  --animate-smog-drift: smog-drift var(--smog-speed, 35s) linear infinite;
  --animate-smoke-float: smoke-float var(--smoke-speed, 25s) ease-in-out infinite;
}

/* ═══════════════════════════════════════════
   GOLDEN HOUR FOUNDRY PALETTE
   Industrial steampunk — warm amber-lit
   ═══════════════════════════════════════════ */

:root {
  --radius: 0.25rem;

  /* Core palette */
  --soot: #0d0c0a;
  --iron: #1a1814;
  --smog: #2a2520;
  --gunmetal: #3d3630;
  --ash: #6b5d52;
  --brass: #c4943d;
  --copper: #b87333;
  --amber-glow: #e8a835;
  --furnace: #d4622a;
  --steam: #d4cabb;
  --patina: #5a7a6d;
  --sky-slate: #4a5568;
  --rust: #a63d2a;

  /* shadcn semantic mapping */
  --background: var(--soot);
  --foreground: var(--steam);
  --card: var(--smog);
  --card-foreground: var(--steam);
  --popover: var(--smog);
  --popover-foreground: var(--steam);
  --primary: var(--brass);
  --primary-foreground: var(--soot);
  --secondary: var(--gunmetal);
  --secondary-foreground: var(--steam);
  --muted: var(--iron);
  --muted-foreground: var(--ash);
  --accent: var(--copper);
  --accent-foreground: var(--soot);
  --destructive: var(--rust);
  --border: var(--gunmetal);
  --input: var(--gunmetal);
  --ring: var(--brass);

  /* Charts */
  --chart-1: var(--brass);
  --chart-2: var(--copper);
  --chart-3: var(--patina);
  --chart-4: var(--furnace);
  --chart-5: var(--amber-glow);

  /* Sidebar */
  --sidebar: var(--iron);
  --sidebar-foreground: var(--steam);
  --sidebar-primary: var(--brass);
  --sidebar-primary-foreground: var(--soot);
  --sidebar-accent: var(--smog);
  --sidebar-accent-foreground: var(--steam);
  --sidebar-border: var(--gunmetal);
  --sidebar-ring: var(--brass);
}

/* Dark variant mirrors root (app is always dark) */
.dark {
  --background: var(--soot);
  --foreground: var(--steam);
  --card: var(--smog);
  --card-foreground: var(--steam);
  --popover: var(--smog);
  --popover-foreground: var(--steam);
  --primary: var(--brass);
  --primary-foreground: var(--soot);
  --secondary: var(--gunmetal);
  --secondary-foreground: var(--steam);
  --muted: var(--iron);
  --muted-foreground: var(--ash);
  --accent: var(--copper);
  --accent-foreground: var(--soot);
  --destructive: var(--rust);
  --border: var(--gunmetal);
  --input: var(--gunmetal);
  --ring: var(--brass);
  --chart-1: var(--brass);
  --chart-2: var(--copper);
  --chart-3: var(--patina);
  --chart-4: var(--furnace);
  --chart-5: var(--amber-glow);
  --sidebar: var(--iron);
  --sidebar-foreground: var(--steam);
  --sidebar-primary: var(--brass);
  --sidebar-primary-foreground: var(--soot);
  --sidebar-accent: var(--smog);
  --sidebar-accent-foreground: var(--steam);
  --sidebar-border: var(--gunmetal);
  --sidebar-ring: var(--brass);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    font-family: var(--font-body), sans-serif;
  }
  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-heading), serif;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    text-shadow: 0 0 40px rgba(196, 148, 61, 0.3);
  }
}

/* ═══════════════════════════════════════════
   KEYFRAMES
   ═══════════════════════════════════════════ */

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes steam-rise {
  0% {
    transform: translateY(0) translateX(0) scale(0.5);
    opacity: 0;
  }
  8% {
    opacity: var(--steam-opacity, 0.15);
  }
  50% {
    transform: translateY(-50vh) translateX(var(--steam-drift, 30px)) scale(1.2);
    opacity: var(--steam-opacity, 0.15);
  }
  100% {
    transform: translateY(-100vh) translateX(var(--steam-drift, 30px)) scale(2);
    opacity: 0;
  }
}

@keyframes ember-rise {
  0% {
    transform: translateY(0) translateX(0) scale(1);
    opacity: 0;
  }
  10% {
    opacity: var(--ember-opacity, 0.7);
  }
  50% {
    transform: translateY(-50vh) translateX(var(--ember-drift, 20px)) scale(0.8);
    opacity: var(--ember-opacity, 0.5);
  }
  90% {
    opacity: 0.1;
  }
  100% {
    transform: translateY(-100vh) translateX(var(--ember-drift, 20px)) scale(0.3);
    opacity: 0;
  }
}

@keyframes furnace-pulse {
  0%, 100% {
    opacity: 0.06;
  }
  30% {
    opacity: 0.09;
  }
  50% {
    opacity: 0.04;
  }
  70% {
    opacity: 0.08;
  }
}

@keyframes gear-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes smog-drift {
  0% {
    transform: translateX(-30%) scaleX(1.5);
  }
  50% {
    transform: translateX(10%) scaleX(1.3);
  }
  100% {
    transform: translateX(-30%) scaleX(1.5);
  }
}

@keyframes smoke-float {
  0% {
    transform: translate(0, 0) scale(1);
    opacity: var(--smoke-opacity, 0.04);
  }
  33% {
    transform: translate(5vw, -3vh) scale(1.1);
    opacity: calc(var(--smoke-opacity, 0.04) * 1.5);
  }
  66% {
    transform: translate(-3vw, 2vh) scale(0.9);
    opacity: var(--smoke-opacity, 0.04);
  }
  100% {
    transform: translate(0, 0) scale(1);
    opacity: var(--smoke-opacity, 0.04);
  }
}

@keyframes rivet-gleam {
  0%, 100% {
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.6),
      inset 0 1px 1px rgba(255, 255, 255, 0.1);
  }
  50% {
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.6),
      inset 0 1px 1px rgba(255, 255, 255, 0.3);
  }
}

@keyframes piston-load {
  0% { transform: translateX(-100%); }
  50% { transform: translateX(0%); }
  100% { transform: translateX(100%); }
}

/* ═══════════════════════════════════════════
   IRON PLATE — Primary container
   Chamfered corners, rivets, cast iron feel
   ═══════════════════════════════════════════ */

.iron-plate {
  position: relative;
  background: var(--smog);
  border: 1px solid var(--gunmetal);
  clip-path: polygon(
    8px 0%, calc(100% - 8px) 0%,
    100% 8px, 100% calc(100% - 8px),
    calc(100% - 8px) 100%, 8px 100%,
    0% calc(100% - 8px), 0% 8px
  );
  box-shadow:
    inset 1px 1px 0 rgba(255, 255, 255, 0.04),
    inset -1px -1px 0 rgba(0, 0, 0, 0.3);
}

/* Rivet dots positioned at chamfer points */
.iron-plate::before,
.iron-plate::after {
  content: "";
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, var(--ash), var(--gunmetal));
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.5),
    inset 0 1px 1px rgba(255, 255, 255, 0.15);
  z-index: 10;
  animation: rivet-gleam 6s ease-in-out infinite;
}

.iron-plate::before {
  top: 10px;
  left: 10px;
}

.iron-plate::after {
  top: 10px;
  right: 10px;
}

.rivet-bottom-left,
.rivet-bottom-right {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, var(--ash), var(--gunmetal));
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.5),
    inset 0 1px 1px rgba(255, 255, 255, 0.15);
  z-index: 10;
  animation: rivet-gleam 6s ease-in-out 3s infinite;
}

.rivet-bottom-left {
  bottom: 10px;
  left: 10px;
}

.rivet-bottom-right {
  bottom: 10px;
  right: 10px;
}

/* ═══════════════════════════════════════════
   COPPER GAUGE PANEL — Accent container
   ═══════════════════════════════════════════ */

.gauge-panel {
  background: var(--iron);
  border: 2px solid var(--copper);
  border-radius: 2px;
  box-shadow: inset 0 0 20px rgba(184, 115, 51, 0.1);
}

/* ═══════════════════════════════════════════
   BRASS PIPE DIVIDER
   ═══════════════════════════════════════════ */

.brass-pipe {
  height: 4px;
  background: linear-gradient(
    180deg,
    var(--copper) 0%,
    var(--brass) 40%,
    var(--copper) 100%
  );
  border-radius: 2px;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(232, 168, 53, 0.3);
  position: relative;
}

.brass-pipe::before,
.brass-pipe::after {
  content: "";
  position: absolute;
  top: -3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, var(--brass), var(--copper));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

.brass-pipe::before { left: -5px; }
.brass-pipe::after { right: -5px; }

/* ═══════════════════════════════════════════
   I-BEAM DIVIDER — Heavy section separator
   ═══════════════════════════════════════════ */

.i-beam {
  position: relative;
  height: 8px;
  background: linear-gradient(
    180deg,
    var(--gunmetal) 0%,
    var(--ash) 20%,
    var(--gunmetal) 40%,
    var(--gunmetal) 60%,
    var(--ash) 80%,
    var(--gunmetal) 100%
  );
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.i-beam::before,
.i-beam::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--gunmetal);
}

.i-beam::before { top: -3px; }
.i-beam::after { bottom: -3px; }

/* ═══════════════════════════════════════════
   RIVET LINE — Dotted rivet row
   ═══════════════════════════════════════════ */

.rivet-line {
  height: 1px;
  background: repeating-linear-gradient(
    90deg,
    var(--gunmetal) 0px,
    var(--gunmetal) 4px,
    transparent 4px,
    transparent 16px
  );
}

/* ═══════════════════════════════════════════
   IRON SEAM — Subtle horizontal line
   ═══════════════════════════════════════════ */

.iron-seam {
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--gunmetal) 15%,
    var(--ash) 50%,
    var(--gunmetal) 85%,
    transparent 100%
  );
  margin: 0.75rem 0;
}

/* ═══════════════════════════════════════════
   FURNACE GLOW OVERLAY
   ═══════════════════════════════════════════ */

.furnace-overlay {
  position: fixed;
  inset: 0;
  background: radial-gradient(
    ellipse 90% 40% at 50% 110%,
    rgba(212, 98, 42, 0.07),
    transparent 60%
  );
  animation: var(--animate-furnace-glow);
  pointer-events: none;
  z-index: 1;
}

/* ═══════════════════════════════════════════
   VIGNETTE OVERLAY
   ═══════════════════════════════════════════ */

.vignette {
  position: fixed;
  inset: 0;
  background: radial-gradient(
    ellipse 70% 70% at 50% 50%,
    transparent 40%,
    rgba(13, 12, 10, 0.6) 100%
  );
  pointer-events: none;
  z-index: 1;
}

/* ═══════════════════════════════════════════
   SMOG DRIFT — Animated haze bands
   ═══════════════════════════════════════════ */

.smog-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  overflow: hidden;
}

.smog-band {
  position: absolute;
  width: 200%;
  height: 30%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(42, 37, 32, 0.15) 20%,
    rgba(42, 37, 32, 0.08) 50%,
    rgba(42, 37, 32, 0.15) 80%,
    transparent 100%
  );
  filter: blur(40px);
  animation: var(--animate-smog-drift);
}

/* ═══════════════════════════════════════════
   AMBIENT SMOKE BLOBS
   ═══════════════════════════════════════════ */

.smoke-blob {
  position: fixed;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(42, 37, 32, 0.08) 0%,
    transparent 70%
  );
  filter: blur(60px);
  pointer-events: none;
  z-index: 1;
  animation: var(--animate-smoke-float);
}

/* ═══════════════════════════════════════════
   HERO ART — Brass porthole frame
   ═══════════════════════════════════════════ */

.hero-art {
  position: relative;
  border: 3px solid var(--copper);
  border-radius: 3px;
  box-shadow:
    0 8px 40px rgba(0, 0, 0, 0.7),
    0 0 0 1px var(--gunmetal),
    inset 0 0 30px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.hero-art::before {
  content: "";
  position: absolute;
  inset: 0;
  border: 1px solid rgba(196, 148, 61, 0.2);
  border-radius: 2px;
  pointer-events: none;
  z-index: 2;
}

/* ═══════════════════════════════════════════
   PISTON LOADER — Horizontal reciprocating bar
   ═══════════════════════════════════════════ */

.piston-loader {
  position: relative;
  height: 4px;
  background: var(--iron);
  border-radius: 2px;
  overflow: hidden;
}

.piston-loader::after {
  content: "";
  position: absolute;
  inset: 0;
  width: 40%;
  background: linear-gradient(90deg, transparent, var(--brass), transparent);
  animation: piston-load 1.5s ease-in-out infinite;
}

/* ═══════════════════════════════════════════
   ENTRANCE ANIMATIONS
   ═══════════════════════════════════════════ */

.animate-entrance {
  animation: var(--animate-fade-in-up);
}

.animate-entrance[data-delay="1"] { animation-delay: 0.15s; }
.animate-entrance[data-delay="2"] { animation-delay: 0.3s; }
.animate-entrance[data-delay="3"] { animation-delay: 0.45s; }
.animate-entrance[data-delay="4"] { animation-delay: 0.6s; }
.animate-entrance[data-delay="5"] { animation-delay: 0.75s; }

/* ═══════════════════════════════════════════
   REDUCED MOTION
   ═══════════════════════════════════════════ */

@media (prefers-reduced-motion: reduce) {
  .animate-entrance,
  .furnace-overlay,
  .smog-band,
  .smoke-blob {
    animation: none !important;
  }

  .animate-entrance {
    opacity: 1 !important;
    transform: none !important;
  }
}
```

**Step 2: Verify the dev server renders with new colors**

Run: `yarn dev`
Expected: Page loads with dark warm background, brass-colored text. Layout may be broken (landing page not updated yet).

**Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: rewrite globals.css with Golden Hour Foundry palette and component classes"
```

---

### Task 3: Create SVG gear decoration component

**Files:**
- Create: `components/gear-decoration.tsx`

**Step 1: Create the SVG gear component**

```tsx
"use client";

export function GearDecoration() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* Top-right cluster */}
      <svg
        className="absolute -right-16 -top-16 h-64 w-64 opacity-[0.06]"
        viewBox="0 0 200 200"
        style={{ animation: "gear-spin 80s linear infinite" }}
      >
        <GearSVG cx={100} cy={100} r={80} teeth={16} toothDepth={14} />
      </svg>
      <svg
        className="absolute right-20 top-20 h-40 w-40 opacity-[0.04]"
        viewBox="0 0 200 200"
        style={{ animation: "gear-spin 60s linear infinite reverse" }}
      >
        <GearSVG cx={100} cy={100} r={80} teeth={12} toothDepth={14} />
      </svg>

      {/* Bottom-left cluster */}
      <svg
        className="absolute -bottom-20 -left-20 h-72 w-72 opacity-[0.05]"
        viewBox="0 0 200 200"
        style={{ animation: "gear-spin 90s linear infinite" }}
      >
        <GearSVG cx={100} cy={100} r={80} teeth={20} toothDepth={12} />
      </svg>
      <svg
        className="absolute bottom-16 left-32 h-36 w-36 opacity-[0.04]"
        viewBox="0 0 200 200"
        style={{ animation: "gear-spin 70s linear infinite reverse" }}
      >
        <GearSVG cx={100} cy={100} r={80} teeth={10} toothDepth={16} />
      </svg>
    </div>
  );
}

function GearSVG({
  cx,
  cy,
  r,
  teeth,
  toothDepth,
}: {
  cx: number;
  cy: number;
  r: number;
  teeth: number;
  toothDepth: number;
}) {
  const innerR = r - toothDepth;
  const points: string[] = [];
  for (let i = 0; i < teeth; i++) {
    const angle1 = (i / teeth) * Math.PI * 2;
    const angle2 = ((i + 0.35) / teeth) * Math.PI * 2;
    const angle3 = ((i + 0.5) / teeth) * Math.PI * 2;
    const angle4 = ((i + 0.85) / teeth) * Math.PI * 2;
    points.push(`${cx + r * Math.cos(angle1)},${cy + r * Math.sin(angle1)}`);
    points.push(`${cx + r * Math.cos(angle2)},${cy + r * Math.sin(angle2)}`);
    points.push(
      `${cx + innerR * Math.cos(angle3)},${cy + innerR * Math.sin(angle3)}`
    );
    points.push(
      `${cx + innerR * Math.cos(angle4)},${cy + innerR * Math.sin(angle4)}`
    );
  }

  return (
    <g fill="var(--gunmetal)" stroke="var(--ash)" strokeWidth="1">
      <polygon points={points.join(" ")} />
      <circle cx={cx} cy={cy} r={innerR * 0.4} fill="var(--iron)" stroke="var(--ash)" strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={innerR * 0.15} fill="var(--gunmetal)" />
    </g>
  );
}
```

**Step 2: Verify it renders**

Import in `page.tsx` temporarily and check the dev server. Gears should be faintly visible in corners.

**Step 3: Commit**

```bash
git add components/gear-decoration.tsx
git commit -m "feat: add SVG gear decoration component with meshing clusters"
```

---

### Task 4: Create ember particle component

**Files:**
- Create: `components/ember-particles.tsx`

**Step 1: Create the ember particles component**

```tsx
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
```

**Step 2: Verify embers render**

Import in `page.tsx` temporarily. Small orange/amber dots should drift upward.

**Step 3: Commit**

```bash
git add components/ember-particles.tsx
git commit -m "feat: add ember particle system with configurable count and drift"
```

---

### Task 5: Create ambient smoke component

**Files:**
- Create: `components/ambient-smoke.tsx`

**Step 1: Create the smoke component**

This combines the smog drift bands and floating smoke blobs from the design spec.

```tsx
"use client";

export function AmbientSmoke() {
  return (
    <>
      {/* Smog drift bands */}
      <div className="smog-layer" aria-hidden="true">
        <div
          className="smog-band"
          style={{ top: "15%", ["--smog-speed" as string]: "35s" }}
        />
        <div
          className="smog-band"
          style={{
            top: "55%",
            ["--smog-speed" as string]: "45s",
            animationDelay: "-15s",
            opacity: 0.7,
          }}
        />
      </div>

      {/* Floating smoke blobs */}
      <div
        className="smoke-blob"
        style={{
          width: "40vw",
          height: "40vw",
          top: "10%",
          left: "10%",
          ["--smoke-speed" as string]: "30s",
          ["--smoke-opacity" as string]: "0.04",
        }}
        aria-hidden="true"
      />
      <div
        className="smoke-blob"
        style={{
          width: "35vw",
          height: "35vw",
          top: "50%",
          right: "5%",
          ["--smoke-speed" as string]: "25s",
          ["--smoke-opacity" as string]: "0.03",
          animationDelay: "-10s",
        }}
        aria-hidden="true"
      />
      <div
        className="smoke-blob"
        style={{
          width: "50vw",
          height: "50vw",
          bottom: "5%",
          left: "30%",
          ["--smoke-speed" as string]: "40s",
          ["--smoke-opacity" as string]: "0.05",
          animationDelay: "-20s",
        }}
        aria-hidden="true"
      />
    </>
  );
}
```

**Step 2: Verify smoke renders**

Import in `page.tsx`. Should see very faint drifting haze and soft blobs.

**Step 3: Commit**

```bash
git add components/ambient-smoke.tsx
git commit -m "feat: add ambient smoke component with smog bands and floating blobs"
```

---

### Task 6: Create join campaign form component

**Files:**
- Create: `components/join-campaign-form.tsx`

**Step 1: Create the form component**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function JoinCampaignForm() {
  const [value, setValue] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;

    // Accept full URL or raw campaign ID
    const match = trimmed.match(/campaign\/([a-zA-Z0-9-]+)/);
    const campaignId = match ? match[1] : trimmed;
    router.push(`/campaign/${campaignId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste invite link or campaign ID"
        className="flex-1 bg-iron border-gunmetal placeholder:text-ash placeholder:uppercase placeholder:text-xs placeholder:tracking-widest focus:border-brass focus:shadow-[0_0_12px_rgba(196,148,61,0.2)]"
      />
      <Button type="submit" size="lg">
        Join
      </Button>
    </form>
  );
}
```

**Step 2: Commit**

```bash
git add components/join-campaign-form.tsx
git commit -m "feat: add join campaign form with steampunk-styled input"
```

---

### Task 7: Rebuild landing page with new design system

**Files:**
- Modify: `app/page.tsx`

**Step 1: Rewrite the landing page**

```tsx
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmberParticles } from "@/components/ember-particles";
import { AmbientSmoke } from "@/components/ambient-smoke";
import { GearDecoration } from "@/components/gear-decoration";
import { JoinCampaignForm } from "@/components/join-campaign-form";

export default function Home() {
  return (
    <main className="relative min-h-screen bg-soot">
      {/* === Atmospheric layers === */}
      <GearDecoration />
      <AmbientSmoke />
      <EmberParticles count={25} />
      <div className="furnace-overlay" />
      <div className="vignette" />

      {/* === Content === */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-16 px-6 py-16">
        {/* Hero Section */}
        <section className="grid w-full items-center gap-10 lg:grid-cols-2 lg:gap-14">
          {/* Hero Art */}
          <div
            className="hero-art animate-entrance order-first lg:order-last"
            data-delay="2"
          >
            <Image
              src="/images/hero-tavern.png"
              alt="A candlelit fantasy tavern with adventurers gathered around a quest board"
              width={800}
              height={600}
              className="block h-auto w-full"
              priority
            />
          </div>

          {/* Iron Plate Card */}
          <div
            className="iron-plate animate-entrance p-8 lg:p-10"
            data-delay="1"
          >
            <span className="rivet-bottom-left" />
            <span className="rivet-bottom-right" />

            <h1
              className="mb-2 text-4xl tracking-[0.15em] text-primary lg:text-5xl"
              style={{ fontFamily: "var(--font-display), sans-serif" }}
            >
              SAGA
            </h1>

            <div className="iron-seam" />

            <p
              className="mb-3 text-sm uppercase tracking-[0.12em] text-ash"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              Your table. Your tale. AI Game Master.
            </p>
            <p className="mb-8 leading-relaxed text-steam/80">
              Gather your party and embark on adventures through dark fantasy
              realms. An AI Game Master narrates your story, rolls the dice, and
              brings the world to life — no preparation needed.
            </p>

            <Button
              asChild
              size="lg"
              className="w-full text-base font-semibold uppercase tracking-widest transition-all duration-300 hover:shadow-[0_0_24px_rgba(196,148,61,0.35)] sm:w-auto"
            >
              <Link href="/campaign/new">Create Campaign</Link>
            </Button>
          </div>
        </section>

        {/* I-beam divider */}
        <div
          className="i-beam animate-entrance w-full max-w-xs"
          data-delay="3"
        />

        {/* Join Section */}
        <section className="w-full max-w-lg animate-entrance" data-delay="3">
          <div className="iron-plate p-6">
            <span className="rivet-bottom-left" />
            <span className="rivet-bottom-right" />

            <h2
              className="mb-4 text-center text-xl tracking-widest text-primary"
              style={{ fontFamily: "var(--font-heading), serif" }}
            >
              Join a Campaign
            </h2>

            <div className="iron-seam mb-4" />

            <JoinCampaignForm />
          </div>
        </section>

        {/* Footer */}
        <footer
          className="animate-entrance text-xs uppercase tracking-[0.12em] text-ash"
          style={{ fontFamily: "var(--font-mono), monospace" }}
          data-delay="4"
        >
          Powered by Claude
        </footer>
      </div>
    </main>
  );
}
```

**Step 2: Verify the landing page renders correctly**

Run: `yarn dev`
Expected: Dark warm background, brass-colored "SAGA" title in Pragati Narrow, iron plate cards with chamfered corners, ember particles rising, smoke drifting, gear silhouettes in corners, vignette darkening edges, furnace glow from below.

**Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: rebuild landing page with Golden Hour Foundry design system"
```

---

### Task 8: Visual verification and polish pass

**Files:**
- Possibly modify: `app/globals.css`, `app/page.tsx`, any component

**Step 1: Run dev server and check all pages**

Run: `yarn dev`

Verify:
- [ ] Fonts load: Pragati Narrow (display), Rokkitt (headings), Barlow Condensed (body), Share Tech Mono (captions)
- [ ] Colors: dark warm background, brass accents, copper borders, steam-colored text
- [ ] Iron plate cards: chamfered corners via clip-path, rivets at corners
- [ ] Atmospheric effects: embers rising, smoke drifting, gears rotating faintly, furnace glow pulsing, vignette
- [ ] I-beam divider renders with weight
- [ ] Button hover: brass glow shadow
- [ ] Input focus: brass border + amber glow
- [ ] `prefers-reduced-motion`: all animations disabled
- [ ] Mobile responsive: stacked layout, fewer visual effects visible
- [ ] No console errors

**Step 2: Fix any visual issues found**

Adjust CSS values, opacities, timing as needed.

**Step 3: Run the build to ensure no TypeScript errors**

Run: `yarn build`
Expected: Build succeeds with no errors.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: polish steampunk design — visual adjustments from review"
```

---

### Task 9: Final commit — clean up any removed files

**Files:**
- Remove if still tracked: old component files that were part of the previous design

**Step 1: Check git status for stale files**

Run: `git status`

If old files (like `particle-field.tsx` references) exist, remove them.

**Step 2: Commit cleanup**

```bash
git add -A
git commit -m "chore: clean up old design system files"
```
