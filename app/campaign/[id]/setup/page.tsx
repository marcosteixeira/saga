'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { EmberParticles } from '@/components/ember-particles'
import { AmbientSmoke } from '@/components/ambient-smoke'
import { GearDecoration } from '@/components/gear-decoration'
import { WorldPreview } from '@/components/campaign/WorldPreview'
import type { Campaign } from '@/types'

const SETUP_ELIGIBLE_STATUSES: Array<Campaign['status']> = ['generating', 'error', 'lobby']

type CampaignFile = {
  filename: string
  content: string
}

type CampaignPayload = {
  campaign: Campaign
  files: CampaignFile[]
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
  const [worldContent, setWorldContent] = useState('')
  const [statusText, setStatusText] = useState('Loading campaign setup...')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [isRetrying, setIsRetrying] = useState(false)

  const loadCampaign = useCallback(async (): Promise<CampaignPayload> => {
    const res = await fetch(`/api/campaign/${campaignId}`)
    if (!res.ok) {
      throw new Error('Campaign not found.')
    }

    const data = (await res.json()) as CampaignPayload
    const worldFile = data.files?.find((file) => file.filename === 'WORLD.md')

    setCampaign(data.campaign)
    setWorldContent(worldFile?.content ?? '')
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
      .on('broadcast', { event: 'world:progress' }, ({ payload }) => {
        if (!mounted) return
        const attempt = typeof payload.attempt === 'number' ? payload.attempt : '?'
        const max = typeof payload.maxAttempts === 'number' ? payload.maxAttempts : '?'
        setStatusText(`Generating world... (attempt ${attempt}/${max})`)
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

            {!(campaign?.status === 'lobby' && campaign) && (
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

          {campaign?.status === 'lobby' && campaign && (
            <WorldPreview campaign={campaign} worldContent={worldContent} />
          )}
        </div>
      </div>
    </main>
  )
}
