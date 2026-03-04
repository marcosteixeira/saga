import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmberParticles } from "@/components/ember-particles";
import { AmbientSmoke } from "@/components/ambient-smoke";
import { GearDecoration } from "@/components/gear-decoration";
import { JoinCampaignForm } from "@/components/join-campaign-form";
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
              src="/images/hero-steampunk.png"
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
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-gunmetal bg-transparent px-10 text-sm uppercase tracking-[0.15em] text-steam/80 transition-all duration-300 hover:border-copper hover:bg-smog/50 hover:text-steam"
              >
                <Link href="#join">Join Existing</Link>
              </Button>
            </div>
          </div>
        </div>

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
          SECTION 2 — FEATURES: Overlapping iron plates
          ═══════════════════════════════════════════ */}
      <section className="relative px-6 py-32">
        {/* Section label */}
        <div className="mx-auto mb-20 max-w-4xl text-center">
          <div className="brass-nameplate mx-auto mb-6">How It Works</div>
          <h2
            className="text-3xl tracking-[0.1em] text-primary lg:text-4xl"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            THE ENGINE ROOM
          </h2>
          <div className="mx-auto mt-4 h-[1px] w-32 bg-gradient-to-r from-transparent via-copper to-transparent" />
        </div>

        {/* Feature plates — asymmetric grid */}
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3 md:gap-4">
          {/* Feature 1 — slightly rotated */}
          <div className="feature-plate p-8 transition-transform duration-500 hover:-translate-y-1 md:-rotate-1">
            <div className="mb-4 flex items-center gap-3">
              <div className="pressure-gauge !h-14 !w-14 !border-2">
                <span
                  className="text-lg font-bold text-brass"
                  style={{ fontFamily: "var(--font-display), sans-serif" }}
                >
                  01
                </span>
              </div>
              <h3
                className="text-base tracking-[0.08em] text-brass"
                style={{ fontFamily: "var(--font-heading), serif" }}
              >
                Create
              </h3>
            </div>
            <div className="iron-seam mb-4" />
            <p className="text-sm leading-relaxed text-steam/80">
              Name your campaign and choose a setting. The AI generates a living
              world with lore, factions, and a map — ready in seconds.
            </p>
          </div>

          {/* Feature 2 — level, elevated */}
          <div className="feature-plate p-8 transition-transform duration-500 hover:-translate-y-1 md:-translate-y-4">
            <div className="mb-4 flex items-center gap-3">
              <div className="pressure-gauge !h-14 !w-14 !border-2">
                <span
                  className="text-lg font-bold text-brass"
                  style={{ fontFamily: "var(--font-display), sans-serif" }}
                >
                  02
                </span>
              </div>
              <h3
                className="text-base tracking-[0.08em] text-brass"
                style={{ fontFamily: "var(--font-heading), serif" }}
              >
                Gather
              </h3>
            </div>
            <div className="iron-seam mb-4" />
            <p className="text-sm leading-relaxed text-steam/80">
              Share an invite link. Players join the lobby, create characters,
              and get AI-generated portraits. 1 to 6 adventurers.
            </p>
          </div>

          {/* Feature 3 — opposite rotation */}
          <div className="feature-plate p-8 transition-transform duration-500 hover:-translate-y-1 md:rotate-1">
            <div className="mb-4 flex items-center gap-3">
              <div className="pressure-gauge !h-14 !w-14 !border-2">
                <span
                  className="text-lg font-bold text-brass"
                  style={{ fontFamily: "var(--font-display), sans-serif" }}
                >
                  03
                </span>
              </div>
              <h3
                className="text-base tracking-[0.08em] text-brass"
                style={{ fontFamily: "var(--font-heading), serif" }}
              >
                Play
              </h3>
            </div>
            <div className="iron-seam mb-4" />
            <p className="text-sm leading-relaxed text-steam/80">
              The AI Game Master narrates in real-time. Explore, fight, and
              shape the story. Every choice matters. Every die roll counts.
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          SECTION 3 — STATS: Pressure gauge row
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
          SECTION 4 — JOIN: Copper gauge panel
          ═══════════════════════════════════════════ */}
      <section id="join" className="relative px-6 py-32">
        <div className="mx-auto max-w-lg">
          <div className="gauge-panel p-8">
            <div className="mb-6 text-center">
              <div className="brass-nameplate mx-auto mb-4">
                Join Campaign
              </div>
              <h2
                className="text-2xl tracking-[0.1em] text-primary"
                style={{ fontFamily: "var(--font-display), sans-serif" }}
              >
                ENTER THE FRAY
              </h2>
            </div>

            <div className="iron-seam mb-6" />

            <p
              className="mb-6 text-center text-sm uppercase tracking-[0.15em] text-ash"
              style={{ fontFamily: "var(--font-mono), monospace" }}
            >
              Paste an invite link or campaign ID to join
            </p>

            <JoinCampaignForm />
          </div>
        </div>
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
