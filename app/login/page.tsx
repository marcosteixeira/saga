'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getSiteUrl } from '@/lib/site-url'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { EmberParticles } from '@/components/ember-particles'
import { AmbientSmoke } from '@/components/ambient-smoke'
import { GearDecoration } from '@/components/gear-decoration'

function LoginForm() {
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') ?? '/'
  const authError = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(
    authError === 'auth_failed' ? 'The magic seal was broken. Try again.' : null
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.trim()) {
      setError('An email is required to enter the forge.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('That doesn\'t look like a valid email address.')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${getSiteUrl()}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
      },
    })

    if (error) {
      setError('The ravens could not deliver the message. Try again.')
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {sent ? (
        <div className="flex flex-col gap-3 text-center">
          <p
            className="text-lg tracking-wide"
            style={{ color: 'var(--brass)', fontFamily: 'var(--font-heading), serif' }}
          >
            A raven has been dispatched.
          </p>
          <p className="text-sm" style={{ color: 'var(--ash)' }}>
            Check your inbox for a magic link to enter the forge.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Label
              htmlFor="email"
              className="text-xs uppercase tracking-[0.15em]"
              style={{ fontFamily: 'var(--font-mono), monospace', color: 'var(--copper)' }}
            >
              Your Email
            </Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
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
            {loading ? 'Summoning...' : 'Send Magic Link'}
          </Button>
        </>
      )}
    </form>
  )
}

export default function LoginPage() {
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
              <div className="brass-nameplate mx-auto mb-4">Enter the Forge</div>
              <h1
                className="text-2xl tracking-[0.08em] text-steam"
                style={{ fontFamily: 'var(--font-heading), serif' }}
              >
                SIGN IN
              </h1>
              <div className="brass-pipe mx-auto mt-4 w-24" />
            </div>

            <Suspense>
              <LoginForm />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  )
}
