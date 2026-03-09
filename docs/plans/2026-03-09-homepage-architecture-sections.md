# Homepage Architecture Sections Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 3-card "How It Works" section with a 5-step Player's Journey rail, and add a new "AI Engine" section showing the 3 AI models powering Saga.

**Architecture:** All changes are confined to `app/page.tsx`. No new components needed — use existing Tailwind utility classes and the design system CSS classes already defined in `app/globals.css` (e.g. `feature-plate`, `brass-nameplate`, `iron-seam`, `brass-pipe`, `pressure-gauge`). The journey steps connect visually with a horizontal brass pipe line on desktop, stacking vertically on mobile.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, existing dark-fantasy design system

---

### Task 1: Replace "How It Works" 3-card section with 5-step Player's Journey

**Files:**
- Modify: `app/page.tsx` (Section 2 — lines ~141–234)

**Step 1: Read the current section carefully**

Open `app/page.tsx` lines 141–234. Understand the existing structure before touching anything.

**Step 2: Replace the feature plates grid with the journey rail**

Replace the entire contents of Section 2 (`<section className="relative px-6 py-32">` through its closing `</section>`) with the following:

```tsx
{/* ═══════════════════════════════════════════
    SECTION 2 — JOURNEY: 5-step player rail
    ═══════════════════════════════════════════ */}
<section className="relative px-6 py-32">
  {/* Section label */}
  <div className="mx-auto mb-20 max-w-4xl text-center">
    <div className="brass-nameplate mx-auto mb-6">How It Works</div>
    <h2
      className="text-3xl tracking-[0.1em] text-primary lg:text-4xl"
      style={{ fontFamily: "var(--font-display), sans-serif" }}
    >
      THE JOURNEY
    </h2>
    <div className="mx-auto mt-4 h-[1px] w-32 bg-gradient-to-r from-transparent via-copper to-transparent" />
  </div>

  {/* Journey steps — horizontal on desktop, vertical on mobile */}
  <div className="mx-auto max-w-5xl">
    <div className="relative grid grid-cols-1 gap-8 sm:grid-cols-5 sm:gap-0">
      {/* Connecting pipe line — desktop only */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-[42px] hidden h-[3px] sm:block"
        style={{
          background:
            "linear-gradient(90deg, transparent 5%, var(--copper) 20%, var(--brass) 50%, var(--copper) 80%, transparent 95%)",
          boxShadow: "0 0 8px rgba(196,148,61,0.3)",
        }}
        aria-hidden="true"
      />

      {/* Step 1 — Arrive */}
      <div className="flex flex-col items-center px-2 text-center">
        <div
          className="relative z-10 mb-4 flex h-[84px] w-[84px] flex-shrink-0 items-center justify-content-center items-center justify-center rounded-full border-2 text-3xl"
          style={{
            borderColor: "var(--ash)",
            background:
              "radial-gradient(circle at 35% 30%, rgba(154,138,122,0.2), rgba(26,24,20,0.95))",
            boxShadow: "0 0 20px rgba(154,138,122,0.15)",
          }}
        >
          🔐
        </div>
        <h3
          className="mb-2 text-sm font-bold uppercase tracking-[0.07em] text-amber"
          style={{ fontFamily: "var(--font-heading), serif" }}
        >
          Arrive
        </h3>
        <p className="text-xs leading-relaxed text-steam/70">
          Sign in with a magic link. No passwords — just an invitation.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-1">
          <span className="rounded-sm border border-gunmetal/80 bg-gunmetal/40 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-ash">
            Magic Link
          </span>
          <span className="rounded-sm border border-gunmetal/80 bg-gunmetal/40 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-ash">
            OAuth
          </span>
        </div>
      </div>

      {/* Step 2 — Forge a World */}
      <div className="flex flex-col items-center px-2 text-center">
        <div
          className="relative z-10 mb-4 flex h-[84px] w-[84px] flex-shrink-0 items-center justify-center rounded-full border-2 text-3xl"
          style={{
            borderColor: "var(--patina)",
            background:
              "radial-gradient(circle at 35% 30%, rgba(90,122,109,0.2), rgba(26,24,20,0.95))",
            boxShadow: "0 0 20px rgba(90,122,109,0.15)",
          }}
        >
          🌍
        </div>
        <h3
          className="mb-2 text-sm font-bold uppercase tracking-[0.07em] text-amber"
          style={{ fontFamily: "var(--font-heading), serif" }}
        >
          Forge a World
        </h3>
        <p className="text-xs leading-relaxed text-steam/70">
          Name your campaign. The AI conjures a living setting — lore, factions, geography — in seconds.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-1">
          <span className="rounded-sm border border-patina/30 bg-patina/10 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-patina">
            Claude Haiku
          </span>
          <span className="rounded-sm border border-sky-700/30 bg-sky-900/10 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-sky-400/70">
            Gemini Art
          </span>
        </div>
      </div>

      {/* Step 3 — Choose a Class */}
      <div className="flex flex-col items-center px-2 text-center">
        <div
          className="relative z-10 mb-4 flex h-[84px] w-[84px] flex-shrink-0 items-center justify-center rounded-full border-2 text-3xl"
          style={{
            borderColor: "var(--copper)",
            background:
              "radial-gradient(circle at 35% 30%, rgba(184,115,51,0.2), rgba(26,24,20,0.95))",
            boxShadow: "0 0 20px rgba(184,115,51,0.15)",
          }}
        >
          ⚔️
        </div>
        <h3
          className="mb-2 text-sm font-bold uppercase tracking-[0.07em] text-amber"
          style={{ fontFamily: "var(--font-heading), serif" }}
        >
          Choose a Class
        </h3>
        <p className="text-xs leading-relaxed text-steam/70">
          Pick your calling from classes born of the world's own mythology. A portrait is painted for you.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-1">
          <span className="rounded-sm border border-copper/30 bg-copper/10 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-copper">
            Lobby
          </span>
          <span className="rounded-sm border border-sky-700/30 bg-sky-900/10 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-sky-400/70">
            Portrait Gen
          </span>
        </div>
      </div>

      {/* Step 4 — Enter the Fray */}
      <div className="flex flex-col items-center px-2 text-center">
        <div
          className="relative z-10 mb-4 flex h-[84px] w-[84px] flex-shrink-0 items-center justify-center rounded-full border-2 text-3xl"
          style={{
            borderColor: "var(--furnace)",
            background:
              "radial-gradient(circle at 35% 30%, rgba(212,98,42,0.2), rgba(26,24,20,0.95))",
            boxShadow: "0 0 20px rgba(212,98,42,0.15)",
          }}
        >
          🎲
        </div>
        <h3
          className="mb-2 text-sm font-bold uppercase tracking-[0.07em] text-amber"
          style={{ fontFamily: "var(--font-heading), serif" }}
        >
          Enter the Fray
        </h3>
        <p className="text-xs leading-relaxed text-steam/70">
          Up to 6 adventurers gather. The AI Game Master narrates in real time — streaming, alive, reacting to every action.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-1">
          <span className="rounded-sm border border-furnace/30 bg-furnace/10 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-furnace">
            Live WebSocket
          </span>
          <span className="rounded-sm border border-brass/30 bg-brass/10 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-brass">
            Claude Sonnet
          </span>
        </div>
      </div>

      {/* Step 5 — Shape the Legend */}
      <div className="flex flex-col items-center px-2 text-center">
        <div
          className="relative z-10 mb-4 flex h-[84px] w-[84px] flex-shrink-0 items-center justify-center rounded-full border-2 text-3xl"
          style={{
            borderColor: "var(--amber)",
            background:
              "radial-gradient(circle at 35% 30%, rgba(232,168,53,0.2), rgba(26,24,20,0.95))",
            boxShadow: "0 0 20px rgba(232,168,53,0.15)",
          }}
        >
          📜
        </div>
        <h3
          className="mb-2 text-sm font-bold uppercase tracking-[0.07em] text-amber"
          style={{ fontFamily: "var(--font-heading), serif" }}
        >
          Shape the Legend
        </h3>
        <p className="text-xs leading-relaxed text-steam/70">
          Every round is remembered. NPCs, events, wounds — the world's memory grows with each session.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-1">
          <span className="rounded-sm border border-brass/30 bg-brass/10 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-brass">
            MEMORY.md
          </span>
          <span className="rounded-sm border border-patina/30 bg-patina/10 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-patina">
            Persistent DB
          </span>
        </div>
      </div>
    </div>
  </div>
</section>
```

**Step 3: Run the dev server and visually verify**

```bash
yarn dev
```

Open `http://localhost:3000`. Check that:
- 5 orbs display in a row on desktop with a brass connecting pipe
- On mobile (resize window < 640px) they stack vertically
- Each step has colored border matching its badge color

**Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: replace 3-card How It Works with 5-step player journey"
```

---

### Task 2: Add "AI Engine" section between Journey and Stats

**Files:**
- Modify: `app/page.tsx` (insert new section between the journey section and the stats section)

**Step 1: Locate insertion point**

Find the stats section (Section 3) which starts with:
```tsx
{/* ═══════════════════════════════════════════
    SECTION 3 — STATS
```

**Step 2: Insert the AI Engine section immediately before the stats section**

```tsx
{/* ═══════════════════════════════════════════
    SECTION 3 — AI ENGINE: Three model cards
    ═══════════════════════════════════════════ */}
<section className="relative px-6 py-20">
  {/* Section label */}
  <div className="mx-auto mb-16 max-w-4xl text-center">
    <div className="brass-nameplate mx-auto mb-6">Under the Hood</div>
    <h2
      className="text-3xl tracking-[0.1em] text-primary lg:text-4xl"
      style={{ fontFamily: "var(--font-display), sans-serif" }}
    >
      THE FOUNDRY
    </h2>
    <div className="mx-auto mt-4 h-[1px] w-32 bg-gradient-to-r from-transparent via-copper to-transparent" />
    <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-steam/70">
      Three specialized AI models working in concert — each mastering its own domain of the adventure.
    </p>
  </div>

  {/* AI model cards */}
  <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3 md:gap-4">
    {/* Claude Sonnet — Game Master */}
    <div
      className="feature-plate p-8 transition-transform duration-500 hover:-translate-y-1"
      style={{ borderTop: "2px solid var(--brass)" }}
    >
      <p
        className="mb-3 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-brass/60"
      >
        Anthropic — Claude Sonnet 4.6
      </p>
      <div className="mb-4 flex items-center gap-3">
        <div className="pressure-gauge !h-14 !w-14 !border-2">
          <span className="text-xl">🎭</span>
        </div>
        <h3
          className="text-base tracking-[0.08em] text-brass"
          style={{ fontFamily: "var(--font-heading), serif" }}
        >
          Game Master
        </h3>
      </div>
      <div className="iron-seam mb-4" />
      <p className="mb-4 text-sm leading-relaxed text-steam/80">
        Real-time streaming narration over WebSocket. Holds full conversation history per session with prompt caching.
      </p>
      <dl className="space-y-1">
        {[
          ["Transport", "WebSocket (Deno)"],
          ["Output", "Streaming chunks"],
          ["Location", "game-session fn"],
        ].map(([label, value]) => (
          <div key={label} className="flex gap-2 font-mono text-[0.65rem]">
            <dt className="text-ash/60 uppercase tracking-wider">{label}:</dt>
            <dd className="text-steam/70">{value}</dd>
          </div>
        ))}
      </dl>
    </div>

    {/* Claude Haiku — World Builder */}
    <div
      className="feature-plate p-8 transition-transform duration-500 hover:-translate-y-1 md:-translate-y-4"
      style={{ borderTop: "2px solid var(--patina)" }}
    >
      <p
        className="mb-3 font-mono text-[0.65rem] uppercase tracking-[0.15em]"
        style={{ color: "var(--patina)" }}
      >
        Anthropic — Claude Haiku 4.5
      </p>
      <div className="mb-4 flex items-center gap-3">
        <div className="pressure-gauge !h-14 !w-14 !border-2">
          <span className="text-xl">🌍</span>
        </div>
        <h3
          className="text-base tracking-[0.08em] text-brass"
          style={{ fontFamily: "var(--font-heading), serif" }}
        >
          World Builder
        </h3>
      </div>
      <div className="iron-seam mb-4" />
      <p className="mb-4 text-sm leading-relaxed text-steam/80">
        Webhook-triggered world generation from a campaign brief. Produces full WORLD.md content with section validation and class extraction.
      </p>
      <dl className="space-y-1">
        {[
          ["Trigger", "Supabase webhook"],
          ["Retries", "3× on missing sections"],
          ["Output", "WORLD.md + classes"],
        ].map(([label, value]) => (
          <div key={label} className="flex gap-2 font-mono text-[0.65rem]">
            <dt className="text-ash/60 uppercase tracking-wider">{label}:</dt>
            <dd className="text-steam/70">{value}</dd>
          </div>
        ))}
      </dl>
    </div>

    {/* Gemini — Artisan */}
    <div
      className="feature-plate p-8 transition-transform duration-500 hover:-translate-y-1"
      style={{ borderTop: "2px solid var(--sky-slate, #4a5568)" }}
    >
      <p
        className="mb-3 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-sky-500/60"
      >
        Google — Gemini Pro Image
      </p>
      <div className="mb-4 flex items-center gap-3">
        <div className="pressure-gauge !h-14 !w-14 !border-2">
          <span className="text-xl">🎨</span>
        </div>
        <h3
          className="text-base tracking-[0.08em] text-brass"
          style={{ fontFamily: "var(--font-heading), serif" }}
        >
          Artisan
        </h3>
      </div>
      <div className="iron-seam mb-4" />
      <p className="mb-4 text-sm leading-relaxed text-steam/80">
        Parallel cover and map generation on world creation. Character portraits on demand. Images stored in Supabase Storage.
      </p>
      <dl className="space-y-1">
        {[
          ["Parallel", "cover + map"],
          ["On demand", "portraits"],
          ["Storage", "campaign-images"],
        ].map(([label, value]) => (
          <div key={label} className="flex gap-2 font-mono text-[0.65rem]">
            <dt className="text-ash/60 uppercase tracking-wider">{label}:</dt>
            <dd className="text-steam/70">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  </div>
</section>
```

**Step 3: Update the old stats section comment to "SECTION 4"**

Find:
```tsx
{/* ═══════════════════════════════════════════
    SECTION 3 — STATS: Pressure gauge row
```
Replace with:
```tsx
{/* ═══════════════════════════════════════════
    SECTION 4 — STATS: Pressure gauge row
```

**Step 4: Visually verify**

```bash
yarn dev
```

Check `http://localhost:3000`:
- AI Engine section appears between journey and stats
- Middle card is elevated (`-translate-y-4`) on desktop
- Each card has a colored top border matching its model (brass / patina / slate)
- The `dl` detail rows render cleanly in monospace

**Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add AI engine section to homepage with 3 model cards"
```

---

### Task 3: Verify full page on mobile

**Step 1: Open Chrome DevTools mobile view**

In Chrome at `http://localhost:3000`, open DevTools → toggle device toolbar → set to iPhone 12 (390px wide).

**Step 2: Check journey section**

- 5 steps stack vertically
- The horizontal pipe line (`hidden sm:block`) is not visible
- Each orb is centered
- Text is readable at small size

**Step 3: Check AI engine section**

- 3 cards stack in single column (`md:grid-cols-3` → single col on mobile)
- Middle card is NOT elevated on mobile (offset only applies at `md:`)
- Detail rows don't overflow

**Step 4: If any visual issue found, fix in `app/page.tsx` and re-verify**

**Step 5: Final commit if fixes were needed**

```bash
git add app/page.tsx
git commit -m "fix: homepage journey and AI sections mobile layout"
```
