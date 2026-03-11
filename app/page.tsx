import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmberParticles } from "@/components/ember-particles";
import { AmbientSmoke } from "@/components/ambient-smoke";
import { GearDecoration } from "@/components/gear-decoration";
import { JoinCampaignModal } from "@/components/join-campaign-modal";
import { SteamVent } from "@/components/steam-vent";

export default function Home() {
  return (
    <main className="relative min-h-screen bg-soot">
      {/* === Atmospheric layers === */}
      <GearDecoration />
      <AmbientSmoke />
      <EmberParticles count={30} />
      <div className="furnace-overlay" />
      <div className="vignette" />

      {/* ═══════════════════════════════════════════
          SECTION 1 — HERO: Split composition
          Left: title + CTA | Right: image fading into dark
          ═══════════════════════════════════════════ */}
      <section className="relative flex min-h-screen items-center overflow-hidden">
        {/* Hero image — right side, fading into darkness */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="hero-image-container absolute inset-0">
            <Image
              src="/images/hero-steampunk.webp"
              alt=""
              fill
              priority
              className="object-cover object-[70%_30%] lg:object-[60%_20%]"
              sizes="100vw"
            />
            {/* Gradient mask: fades image from right to left into darkness */}
            <div
              className="absolute inset-0"
              style={{
                background: [
                  "linear-gradient(90deg, var(--soot) 0%, var(--soot) 15%, rgba(13,12,10,0.85) 35%, rgba(13,12,10,0.4) 60%, rgba(13,12,10,0.2) 100%)",
                  "linear-gradient(0deg, var(--soot) 0%, transparent 30%)",
                  "linear-gradient(180deg, rgba(13,12,10,0.6) 0%, transparent 20%)",
                ].join(", "),
              }}
            />
          </div>
        </div>

        {/* Noise texture overlay */}
        <div
          className="pointer-events-none absolute inset-0 z-[1] opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
            backgroundSize: "200px 200px",
          }}
          aria-hidden="true"
        />

        {/* Main content — left-aligned */}
        <div className="relative z-10 mx-auto flex w-full max-w-7xl items-center px-6 py-24 lg:px-12">
          <div className="flex max-w-xl flex-col lg:max-w-lg">
            {/* Nameplate */}
            <div className="animate-entrance brass-nameplate mb-8 self-start" data-delay="1">
              AI-Powered Tabletop RPG Engine
            </div>

            {/* Title */}
            <h1
              className="display-title animate-entrance mb-6 text-[clamp(4rem,12vw,9rem)]"
              data-delay="1"
            >
              SAGA
            </h1>

            {/* Subtitle line with decorative pipes */}
            <div
              className="animate-entrance mb-8 flex items-center gap-4"
              data-delay="2"
            >
              <span className="h-[1px] w-8 bg-gradient-to-r from-transparent to-copper" />
              <p
                className="text-sm uppercase tracking-[0.2em] text-steam/80"
                style={{ fontFamily: "var(--font-mono), monospace" }}
              >
                Your table &middot; Your tale &middot; AI Game Master
              </p>
            </div>

            {/* Description */}
            <p
              className="animate-entrance mb-10 text-base leading-relaxed text-steam/90 lg:text-lg"
              data-delay="2"
            >
              Gather your party and embark on adventures through realms shaped by
              an AI Game Master. No preparation needed — just imagination and a
              roll of the dice.
            </p>

            {/* CTA Buttons */}
            <div
              className="animate-entrance flex flex-col gap-4 sm:flex-row sm:items-center"
              data-delay="3"
            >
              <Button
                asChild
                size="lg"
                className="group relative overflow-hidden px-10 text-base font-bold uppercase tracking-[0.15em] transition-all duration-500 hover:shadow-[0_0_30px_rgba(196,148,61,0.4),0_0_60px_rgba(196,148,61,0.15)]"
              >
                <Link href="/campaign/new">
                  <span className="relative z-10">Create Campaign</span>
                  <span
                    className="absolute inset-0 bg-gradient-to-r from-brass via-amber to-brass opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </Link>
              </Button>
              <JoinCampaignModal />
            </div>

          </div>
        </div>

        {/* ── Blueprint tag — bottom-right of hero ── */}
        <Link
          href="/architecture"
          target="_blank"
          rel="noopener noreferrer"
          className="animate-entrance group absolute bottom-16 right-6 z-20 flex flex-col items-end gap-1 lg:right-10"
          data-delay="4"
          aria-label="View architecture schematic slide deck"
        >
          {/* Top rule with rivet dot */}
          <span className="flex items-center gap-1.5">
            <span className="h-px w-12 bg-gradient-to-l from-brass to-transparent" />
            <span className="h-1.5 w-1.5 rounded-full bg-brass" style={{ boxShadow: "0 0 6px rgba(196,148,61,1)" }} />
          </span>
          {/* Main tag body */}
          <span
            className="flex items-center gap-2.5 border border-brass/60 bg-soot/90 px-3 py-2 backdrop-blur-sm transition-all duration-300 group-hover:border-brass group-hover:bg-iron group-hover:shadow-[0_0_24px_rgba(196,148,61,0.3)]"
            style={{
              clipPath: "polygon(8px 0%,100% 0%,100% calc(100% - 8px),calc(100% - 8px) 100%,0% 100%,0% 8px)",
            }}
          >
            <span
              className="text-[0.6rem] uppercase tracking-[0.22em] text-steam transition-colors duration-300 group-hover:text-steam"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              Architecture
            </span>
            <span className="h-3 w-px bg-brass/40" />
            <span
              className="text-[0.6rem] uppercase tracking-[0.18em] text-brass transition-colors duration-300 group-hover:text-amber"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              16 slides ↗
            </span>
          </span>
          {/* Bottom rule */}
          <span className="flex items-center gap-1.5">
            <span className="h-px w-6 bg-gradient-to-l from-copper to-transparent" />
            <span className="h-1 w-1 rounded-full bg-copper" style={{ boxShadow: "0 0 4px rgba(184,115,51,0.8)" }} />
          </span>
        </Link>

        {/* Steam vent at bottom of hero */}
        <SteamVent puffs={10} />

        {/* Scroll indicator */}
        <div
          className="animate-entrance absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2"
          data-delay="5"
        >
          <span
            className="text-xs uppercase tracking-[0.2em] text-ash/80"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            Scroll
          </span>
          <span className="h-8 w-[1px] animate-pulse bg-gradient-to-b from-ash/40 to-transparent" />
        </div>
      </section>

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
                className="relative z-10 mb-4 flex h-[84px] w-[84px] flex-shrink-0 items-center justify-center rounded-full border-2 text-3xl"
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
                Pick your calling from classes born of the world&apos;s own mythology. A portrait is painted for you.
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
                  Realtime Broadcast
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
                Every round is remembered. NPCs, events, wounds — the world&apos;s memory grows with each session.
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
            <p className="mb-3 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-brass/60">
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
              Real-time streaming narration via Next.js API routes. Chunks broadcast to all players via Supabase Realtime. Full conversation history with prompt caching.
            </p>
            <dl className="space-y-1">
              {(
                [
                  ["Transport", "Next.js API + Vercel"],
                  ["Output", "Realtime broadcast"],
                  ["Location", "app/api/game-session"],
                ] as [string, string][]
              ).map(([label, value]) => (
                <div key={label} className="flex gap-2 font-mono text-[0.65rem]">
                  <dt className="uppercase tracking-wider text-ash/60">{label}:</dt>
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
              {(
                [
                  ["Trigger", "Supabase webhook"],
                  ["Retries", "3× on missing sections"],
                  ["Output", "WORLD.md + classes"],
                ] as [string, string][]
              ).map(([label, value]) => (
                <div key={label} className="flex gap-2 font-mono text-[0.65rem]">
                  <dt className="uppercase tracking-wider text-ash/60">{label}:</dt>
                  <dd className="text-steam/70">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Gemini — Artisan */}
          <div
            className="feature-plate p-8 transition-transform duration-500 hover:-translate-y-1"
            style={{ borderTop: "2px solid #4a5568" }}
          >
            <p className="mb-3 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-sky-500/60">
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
              {(
                [
                  ["Parallel", "cover + map"],
                  ["On demand", "portraits"],
                  ["Storage", "campaign-images"],
                ] as [string, string][]
              ).map(([label, value]) => (
                <div key={label} className="flex gap-2 font-mono text-[0.65rem]">
                  <dt className="uppercase tracking-wider text-ash/60">{label}:</dt>
                  <dd className="text-steam/70">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          SECTION 4 — STATS: Pressure gauge row
          ═══════════════════════════════════════════ */}
      <section className="relative overflow-hidden py-20">
        {/* I-beam top */}
        <div className="i-beam" />

        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-10 py-16 sm:gap-16">
          <div className="flex flex-col items-center gap-2">
            <div className="pressure-gauge">
              <span
                className="text-2xl font-bold text-amber"
                style={{ fontFamily: "var(--font-display), sans-serif" }}
              >
                d20
              </span>
            </div>
            <span
              className="mt-2 text-sm uppercase tracking-[0.12em] text-ash"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              Dice System
            </span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="pressure-gauge">
              <span
                className="text-2xl font-bold text-amber"
                style={{ fontFamily: "var(--font-display), sans-serif" }}
              >
                6
              </span>
            </div>
            <span
              className="mt-2 text-sm uppercase tracking-[0.12em] text-ash"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              Max Players
            </span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="pressure-gauge">
              <span
                className="text-2xl font-bold text-amber"
                style={{ fontFamily: "var(--font-display), sans-serif" }}
              >
                AI
              </span>
            </div>
            <span
              className="mt-2 text-sm uppercase tracking-[0.12em] text-ash"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              Game Master
            </span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="pressure-gauge">
              <span
                className="text-2xl font-bold text-amber"
                style={{ fontFamily: "var(--font-display), sans-serif" }}
              >
                &infin;
              </span>
            </div>
            <span
              className="mt-2 text-sm uppercase tracking-[0.12em] text-ash"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              Worlds
            </span>
          </div>
        </div>

        {/* I-beam bottom */}
        <div className="i-beam" />
      </section>

      {/* ═══════════════════════════════════════════
          FOOTER
          ═══════════════════════════════════════════ */}
      <footer className="relative border-t border-gunmetal/50 px-6 py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="brass-pipe w-8" />
            <span
              className="text-xs uppercase tracking-[0.2em] text-ash/80"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              Powered by Claude
            </span>
            <div className="brass-pipe w-8" />
          </div>
          <p
            className="text-xs uppercase tracking-[0.15em] text-ash/60"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            &copy; 2026 Saga &mdash; All systems operational
          </p>
        </div>
      </footer>
    </main>
  );
}
