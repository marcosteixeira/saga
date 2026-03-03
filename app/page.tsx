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
