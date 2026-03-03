'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { EmberParticles } from '@/components/ember-particles'
import { AmbientSmoke } from '@/components/ambient-smoke'
import { GearDecoration } from '@/components/gear-decoration'

function SetupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') ?? '/'

  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({
      data: { display_name: name.trim() },
    })

    if (error) {
      setError('The forge rejected your name. Try again.')
      setLoading(false)
      return
    }

    router.push(redirect)
  }

  function handleSkip() {
    router.push(redirect)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="display_name"
          className="text-xs uppercase tracking-[0.15em]"
          style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--copper)' }}
        >
          Your Name
        </Label>
        <Input
          id="display_name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="DungeonMaster42"
          className="border-gunmetal bg-iron text-steam placeholder:text-ash/60 focus-visible:border-brass focus-visible:ring-0 focus-visible:shadow-[0_0_12px_rgba(196,148,61,0.25)]"
        />
      </div>

      {error && (
        <p className="text-sm" style={{ color: '#a63d2a' }}>
          {error}
        </p>
      )}

      {loading && <div className="piston-loader" aria-label="Loading..." />}

      <Button
        type="submit"
        disabled={loading}
        className="relative overflow-hidden bg-brass text-soot font-bold uppercase tracking-[0.15em] hover:bg-furnace transition-colors duration-300 disabled:opacity-60"
        style={{
          clipPath:
            'polygon(6px 0%, calc(100% - 6px) 0%, 100% 6px, 100% calc(100% - 6px), calc(100% - 6px) 100%, 6px 100%, 0% calc(100% - 6px), 0% 6px)',
        }}
      >
        {loading ? 'Forging...' : 'Set Name'}
      </Button>

      <button
        type="button"
        onClick={handleSkip}
        className="text-xs uppercase tracking-[0.1em] transition-colors"
        style={{ color: 'var(--ash)', fontFamily: 'var(--font-mono), monospace' }}
      >
        Skip for now
      </button>
    </form>
  )
}

export default function SetupPage() {
  return (
    <main className="relative min-h-screen bg-soot">
      <GearDecoration />
      <AmbientSmoke />
      <EmberParticles count={15} />
      <div className="furnace-overlay" />
      <div className="vignette" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-16">
        <div className="w-full max-w-md animate-entrance" data-delay="1">
          <div className="iron-plate p-8 md:p-10" style={{ background: 'rgba(42, 37, 32, 0.85)' }}>
            <div className="rivet-bottom-left" />
            <div className="rivet-bottom-right" />

            <div className="mb-8 text-center">
              <div className="brass-nameplate mx-auto mb-4">Your Forge Name</div>
              <h1
                className="text-2xl tracking-[0.08em] text-steam"
                style={{ fontFamily: 'var(--font-heading), serif' }}
              >
                WHO ARE YOU?
              </h1>
              <p className="mt-2 text-sm" style={{ color: 'var(--ash)' }}>
                Choose a name for the forge. You can change it later.
              </p>
              <div className="brass-pipe mx-auto mt-4 w-24" />
            </div>

            <Suspense>
              <SetupForm />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  )
}
