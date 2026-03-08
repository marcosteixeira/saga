'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AmbientSmoke } from '@/components/ambient-smoke'
import { EmberParticles } from '@/components/ember-particles'
import { GearDecoration } from '@/components/gear-decoration'
import { createClient } from '@/lib/supabase/client'
import type { Campaign } from '@/types'

type ProfileCampaign = Pick<Campaign, 'id' | 'slug' | 'name' | 'status' | 'created_at'> & {
  is_host: boolean
  cover_image_url: string | null
}

function actionForCampaign(campaign: ProfileCampaign): { href: string; label: string } {
  if (campaign.status === 'lobby') {
    return { href: `/campaign/${campaign.slug}/lobby`, label: 'Open Lobby' }
  }
  if (campaign.status === 'active') {
    return { href: `/campaign/${campaign.slug}/game`, label: 'Resume Game' }
  }
  return { href: `/campaign/${campaign.slug}/lobby`, label: 'Open' }
}

export default function ProfilePage() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<ProfileCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resetting, setResetting] = useState<string | null>(null)

  async function resetCampaign(campaign: ProfileCampaign) {
    if (!confirm(`Reset "${campaign.name}"? This will delete all messages and return it to lobby.`)) return
    setResetting(campaign.id)
    try {
      const res = await fetch(`/api/campaign/${campaign.id}/reset`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error ?? 'Failed to reset campaign.')
        return
      }
      setCampaigns((prev) =>
        prev.map((c) => (c.id === campaign.id ? { ...c, status: 'lobby' } : c))
      )
    } finally {
      setResetting(null)
    }
  }

  useEffect(() => {
    let mounted = true

    ;(async () => {
      const {
        data: { user },
      } = await createClient().auth.getUser()

      if (!user) {
        router.replace('/login?redirect=%2Fprofile')
        return
      }

      try {
        const res = await fetch('/api/profile/campaigns')
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error ?? 'Failed to load campaigns.')
        }

        if (!mounted) return
        setCampaigns(data.campaigns ?? [])
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : 'Failed to load campaigns.')
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [router])

  return (
    <main className="relative min-h-screen bg-soot">
      <GearDecoration />
      <AmbientSmoke />
      <EmberParticles count={20} />
      <div className="furnace-overlay" />
      <div className="vignette" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-16">
        <div className="mb-8 text-center">
          <div className="brass-nameplate mx-auto mb-4">Profile</div>
          <h1
            className="text-3xl tracking-[0.08em] text-steam"
            style={{ fontFamily: 'var(--font-heading), serif' }}
          >
            YOUR CAMPAIGNS
          </h1>
          <div className="brass-pipe mx-auto mt-4 w-28" />
        </div>

        <div
          className="iron-plate p-6 md:p-8"
          style={{ background: 'rgba(42, 37, 32, 0.85)' }}
        >
          {loading && (
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="piston-loader" aria-label="Loading..." />
              <p
                className="text-xs uppercase tracking-[0.14em] text-ash"
                style={{ fontFamily: 'var(--font-mono), monospace' }}
              >
                Loading campaigns...
              </p>
            </div>
          )}

          {error && (
            <p className="py-4 text-sm" style={{ color: '#a63d2a' }}>
              {error}
            </p>
          )}

          {!loading && !error && campaigns.length === 0 && (
            <p className="py-4 text-sm text-ash">No campaigns yet.</p>
          )}

          {!loading && !error && campaigns.length > 0 && (
            <div className="space-y-4">
              {campaigns.map((campaign) => {
                const action = actionForCampaign(campaign)
                return (
                  <div
                    key={campaign.id}
                    className="rounded border border-gunmetal bg-smog/60 overflow-hidden"
                  >
                    {campaign.cover_image_url && (
                      <div className="relative h-28 w-full">
                        <Image
                          src={campaign.cover_image_url}
                          alt={campaign.name}
                          fill
                          className="object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-smog/90 to-transparent" />
                      </div>
                    )}
                    <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:p-5">
                      <div>
                        <h2 className="font-heading text-xl text-brass">{campaign.name}</h2>
                        <p
                          className="mt-1 text-xs uppercase tracking-[0.12em] text-ash"
                          style={{ fontFamily: 'var(--font-mono), monospace' }}
                        >
                          {campaign.is_host ? 'Host' : 'Player'} · {campaign.status}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        {campaign.is_host && campaign.status === 'active' && (
                          <button
                            onClick={() => resetCampaign(campaign)}
                            disabled={resetting === campaign.id}
                            className="rounded border border-gunmetal px-3 py-2 text-xs uppercase tracking-[0.12em] text-ash transition-colors hover:border-ember hover:text-ember disabled:opacity-40"
                            style={{ fontFamily: 'var(--font-mono), monospace' }}
                          >
                            {resetting === campaign.id ? 'Resetting…' : 'Reset'}
                          </button>
                        )}
                        <Link
                          href={action.href}
                          className="rounded border border-copper px-3 py-2 text-xs uppercase tracking-[0.12em] text-steam transition-colors hover:border-brass hover:text-brass"
                          style={{ fontFamily: 'var(--font-mono), monospace' }}
                        >
                          {action.label}
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
