import { EmberParticles } from '@/components/ember-particles'
import { AmbientSmoke } from '@/components/ambient-smoke'
import { GearDecoration } from '@/components/gear-decoration'
import { WorldGenForm } from '@/components/campaign/WorldGenForm'

export const metadata = {
  title: 'Forge Campaign — Saga',
}

export default function NewCampaignPage() {
  return (
    <main className="relative min-h-screen bg-soot">
      {/* Atmospheric layers */}
      <GearDecoration />
      <AmbientSmoke />
      <EmberParticles count={15} />
      <div className="furnace-overlay" />
      <div className="vignette" />

      {/* Centered form */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl animate-entrance" data-delay="1">
          {/* Iron plate panel */}
          <div className="iron-plate p-8 md:p-10" style={{ background: 'rgba(42, 37, 32, 0.85)' }}>
            {/* Bottom rivets */}
            <div className="rivet-bottom-left" />
            <div className="rivet-bottom-right" />

            {/* Header */}
            <div className="mb-8 text-center">
              <div
                className="brass-nameplate mx-auto mb-4"
              >
                New Campaign
              </div>
              <h1
                className="text-2xl tracking-[0.08em] text-steam"
                style={{ fontFamily: 'var(--font-heading), serif' }}
              >
                FORGE YOUR WORLD
              </h1>
              <div className="brass-pipe mx-auto mt-4 w-24" />
            </div>

            <WorldGenForm />
          </div>
        </div>
      </div>
    </main>
  )
}
