import { EmberParticles } from '@/components/ember-particles'
import { WorldGenForm } from '@/components/campaign/WorldGenForm'

export const metadata = {
  title: 'Forge Campaign — Saga',
}

export default function NewCampaignPage() {
  return (
    <main className="relative min-h-screen bg-soot overflow-hidden">
      <EmberParticles count={10} />

      {/* Full-bleed background image */}
      <div className="absolute inset-0">
        <img
          src="/images/world-forge-bg.webp"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-left"
        />

        {/* Vignette: dark on the right for panel readability */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to right, rgba(10,10,10,0.05) 0%, rgba(10,10,10,0.5) 45%, rgba(10,10,10,0.93) 72%, rgba(10,10,10,0.99) 100%)',
          }}
        />
        {/* Vignette: bottom fade */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to top, rgba(10,10,10,0.6) 0%, transparent 40%)',
          }}
        />
      </div>

      {/* Floating right panel */}
      <div className="relative z-20 flex min-h-screen items-center justify-end">
        <div className="w-full lg:w-[460px] xl:w-[500px] flex flex-col justify-center px-8 py-12 lg:px-12 lg:py-16 min-h-screen lg:min-h-0">

          {/* Iron plate panel */}
          <div className="iron-plate p-8 md:p-10" style={{ background: 'rgba(26, 24, 20, 0.92)' }}>
            <div className="rivet-bottom-left" />
            <div className="rivet-bottom-right" />

            {/* Header */}
            <div className="mb-8">
              <div className="brass-nameplate mb-4 inline-block">New Campaign</div>
              <h1 className="font-heading text-2xl text-steam tracking-widest mb-3">
                FORGE YOUR WORLD
              </h1>
              <div className="brass-pipe w-16 mb-1" />
            </div>

            <WorldGenForm />
          </div>

        </div>
      </div>
    </main>
  )
}
