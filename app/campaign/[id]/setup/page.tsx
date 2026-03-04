'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { EmberParticles } from '@/components/ember-particles'
import { AmbientSmoke } from '@/components/ambient-smoke'
import { GearDecoration } from '@/components/gear-decoration'
import type { Campaign } from '@/types'

const SETUP_ELIGIBLE_STATUSES: Array<Campaign['status']> = ['generating', 'error', 'lobby']

type CampaignPayload = {
  campaign: Campaign
}

function statusMessage(status: Campaign['status']): string {
  switch (status) {
    case 'generating':
      return 'World forge is active in the background. This page updates automatically.'
    case 'lobby':
      return 'World generation complete.'
    case 'error':
      return 'World generation failed.'
    default:
      return `Campaign moved to '${status}'.`
  }
}

export default function CampaignSetupPage() {
  const params = useParams<{ id: string }>()
  const campaignId = params.id
  const router = useRouter()

  const supabase = useMemo(() => createClient(), [])
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [statusText, setStatusText] = useState('Loading campaign setup...')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [isRetrying, setIsRetrying] = useState(false)
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null)

  const loadCampaign = useCallback(async (): Promise<CampaignPayload> => {
    const res = await fetch(`/api/campaign/${campaignId}`)
    if (!res.ok) {
      throw new Error('Campaign not found.')
    }

    const data = (await res.json()) as CampaignPayload
    setCampaign(data.campaign)
    if (data.campaign.cover_image_url) {
      setCoverImageUrl(data.campaign.cover_image_url)
    }
    setStatusText(statusMessage(data.campaign.status))

    return data
  }, [campaignId])

  useEffect(() => {
    let mounted = true

    const channel = supabase
      .channel(`campaign:${campaignId}`)
      .on('broadcast', { event: 'world:started' }, () => {
        if (!mounted) return
        setError(null)
        setBusy(true)
        setStatusText('World forge is active. This page updates automatically...')
      })
      .on('broadcast', { event: 'world:complete' }, async () => {
        if (!mounted) return
        try {
          const data = await loadCampaign()
          if (!mounted) return
          setBusy(false)
          setError(null)
          setStatusText(statusMessage(data.campaign.status))
        } catch (err) {
          if (!mounted) return
          setError(err instanceof Error ? err.message : 'Failed to load world data.')
          setBusy(false)
        }
      })
      .on('broadcast', { event: 'world:error' }, () => {
        if (!mounted) return
        setBusy(false)
        setError('World generation failed. You can retry from this setup page.')
        setStatusText(statusMessage('error'))
      })
      .on('broadcast', { event: 'world:image_ready' }, (message: { payload: { type: string; url: string } }) => {
        if (!mounted) return
        if (message.payload.type === 'cover') {
          setCoverImageUrl(message.payload.url)
        }
      })
      .subscribe()

    ;(async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          router.replace(`/login?redirect=${encodeURIComponent(`/campaign/${campaignId}/setup`)}`)
          return
        }

        const data = await loadCampaign()
        if (!mounted) return

        if (data.campaign.host_user_id !== user.id) {
          router.replace('/')
          return
        }

        if (!SETUP_ELIGIBLE_STATUSES.includes(data.campaign.status)) {
          router.replace('/')
          return
        }

        setBusy(data.campaign.status === 'generating')
        if (data.campaign.status === 'error') {
          setError('World generation failed. You can retry from this setup page.')
        }
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : 'Failed to load campaign setup.')
        setBusy(false)
      }
    })()

    return () => {
      mounted = false
      void supabase.removeChannel(channel)
    }
  }, [campaignId, loadCampaign, router, supabase])

  async function handleRetryGeneration() {
    setError(null)
    setIsRetrying(true)

    try {
      const res = await fetch(`/api/campaign/${campaignId}/regenerate`, {
        method: 'POST',
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to retry world generation.')
      }

      setBusy(true)
      setStatusText('Retry triggered. World forge is active in the background...')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry world generation.')
      setBusy(false)
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <main className="relative min-h-screen bg-soot">
      {coverImageUrl && (
        <div className="absolute inset-0 z-0 transition-opacity duration-1000">
          <img
            src={coverImageUrl}
            alt="Campaign world cover art"
            className="h-full w-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-soot/60 via-transparent to-soot/80" />
        </div>
      )}
      <GearDecoration />
      <AmbientSmoke />
      <EmberParticles count={15} />
      <div className="furnace-overlay" />
      <div className="vignette" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-16">
        <div className="w-full max-w-3xl animate-entrance" data-delay="1">
          <div className="iron-plate p-8 md:p-10">
            <div className="rivet-bottom-left" />
            <div className="rivet-bottom-right" />

            <div className="mb-8 text-center">
              <div className="brass-nameplate mx-auto mb-4">Campaign Setup</div>
              <h1 className="font-heading text-2xl text-steam">
                WORLD GENERATION
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {statusText}
              </p>
              <div className="brass-pipe mx-auto mt-4 w-24" />
            </div>

            {campaign?.status !== 'lobby' && (
              <div className="flex flex-col items-center gap-6 py-6">
                {busy && <div className="piston-loader" aria-label="Generating..." />}

                {error && (
                  <p className="text-sm text-destructive">
                    {error}
                  </p>
                )}

                <div className="flex w-full max-w-sm gap-3">
                  {(campaign?.status === 'error' || error) && (
                    <Button
                      type="button"
                      onClick={handleRetryGeneration}
                      disabled={isRetrying}
                      className="flex-1"
                    >
                      {isRetrying ? 'Retrying...' : 'Retry Generation'}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push('/')}
                    className="flex-1"
                  >
                    Back Home
                  </Button>
                </div>
              </div>
            )}
          </div>

          {campaign?.status === 'lobby' && (
            <div className="iron-plate p-8 md:p-10 mt-6 text-center">
              <div className="rivet-bottom-left" />
              <div className="rivet-bottom-right" />
              <p className="font-heading text-xl text-gold mb-6 tracking-widest">YOUR WORLD IS READY</p>
              <Button className="w-full max-w-sm" onClick={() => router.push(`/campaign/${campaign.id}/lobby`)}>
                Enter Lobby
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
