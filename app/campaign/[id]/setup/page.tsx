'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { EmberParticles } from '@/components/ember-particles'
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
  const [pageLoading, setPageLoading] = useState(true)
  const [busy, setBusy] = useState(true)
  const [isRetrying, setIsRetrying] = useState(false)
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)

  const loadCampaign = useCallback(async (): Promise<CampaignPayload> => {
    const res = await fetch(`/api/campaign/${campaignId}`)
    if (!res.ok) {
      throw new Error('Campaign not found.')
    }

    const data = (await res.json()) as CampaignPayload
    setCampaign(data.campaign)
    if (data.campaign.cover_image_url) {
      setCoverImageUrl(`${data.campaign.cover_image_url}?t=${Date.now()}`)
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
          setImageLoaded(false)
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
        setPageLoading(false)
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : 'Failed to load campaign setup.')
        setBusy(false)
        setPageLoading(false)
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

  const isComplete = campaign?.status === 'lobby'
  const hasImage = !!coverImageUrl

  return (
    <main className="relative min-h-screen bg-soot overflow-hidden">
      <EmberParticles count={10} />

      {/* Full-bleed background image */}
      <div className="absolute inset-0">
        {/* Placeholder image shown while cover art is not yet ready */}
        {!pageLoading && (
          <img
            src="/images/placeholder-cover.png"
            alt=""
            aria-hidden="true"
            className={`absolute inset-0 h-full w-full object-cover object-left transition-opacity duration-700 ${hasImage && imageLoaded ? 'opacity-0' : 'opacity-100'}`}
          />
        )}

        {/* Cover image — full bleed, contain so nothing is cropped */}
        {coverImageUrl && (
          <img
            src={coverImageUrl}
            alt={`${campaign?.name ?? 'Campaign'} cover art`}
            onLoad={() => setImageLoaded(true)}
            className="absolute inset-0 h-full w-full"
            style={{
              objectFit: 'cover',
              objectPosition: 'left center',
              opacity: imageLoaded ? 1 : 0,
              transition: 'opacity 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        )}

        {/* Vignette: dark on the right for panel readability */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to right, rgba(10,10,10,0.1) 0%, rgba(10,10,10,0.55) 50%, rgba(10,10,10,0.92) 75%, rgba(10,10,10,0.98) 100%)',
          }}
        />
        {/* Vignette: bottom fade */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to top, rgba(10,10,10,0.7) 0%, transparent 40%)',
          }}
        />
      </div>

      {/* Loading forge animation (centered, shown only before image) */}
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="relative flex flex-col items-center gap-6">
            <div className="relative">
              <div
                className="h-24 w-24 rounded-full border-2 border-brass/40"
                style={{
                  animation: 'spin 8s linear infinite',
                  boxShadow: '0 0 30px rgba(212,165,116,0.2), inset 0 0 30px rgba(212,165,116,0.05)',
                }}
              />
              <div
                className="absolute inset-3 rounded-full border border-brass/30"
                style={{ animation: 'spin 5s linear infinite reverse' }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="h-8 w-8 text-brass/80" fill="none" viewBox="0 0 24 24">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                    d="M12 3v3m0 12v3M3 12h3m12 0h3m-2.636-6.364-2.122 2.122M8.758 15.242l-2.122 2.122m0-14.728 2.122 2.122M15.242 15.242l2.122 2.122" />
                </svg>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <p className="painting-text font-heading text-sm uppercase">
                {busy ? 'Forging Your World' : 'Painting Your World'}
              </p>
              <div className="paint-stroke-bar" />
            </div>
          </div>
        </div>
      )}

      {/* Campaign name at bottom-left over image */}
      {campaign?.name && imageLoaded && (
        <div className="absolute bottom-0 left-0 p-8 lg:p-12 z-10 max-w-xl">
          <h2
            className="font-heading text-3xl lg:text-5xl text-steam leading-tight"
            style={{ textShadow: '0 2px 20px rgba(0,0,0,0.9), 0 0 60px rgba(0,0,0,0.8)' }}
          >
            {campaign.name}
          </h2>
        </div>
      )}

      {/* ── RIGHT: Status Panel (floating) ─────────────────────────── */}
      <div className="relative z-20 flex min-h-screen items-center justify-end">
        <div className="w-full lg:w-[420px] xl:w-[480px] flex flex-col justify-center px-8 py-12 lg:px-12 lg:py-16 min-h-screen lg:min-h-0">
          <div className="relative z-10 flex flex-col gap-8">
            {/* Header */}
            <div>
              <div className="brass-nameplate mb-4 inline-block">Campaign Setup</div>
              <h1 className="font-heading text-2xl text-steam tracking-widest mb-3">
                WORLD GENERATION
              </h1>
              <div className="brass-pipe w-16 mb-4" />
            </div>

            {/* Status section */}
            <div className="iron-plate p-6">
              <div className="rivet-bottom-left" />
              <div className="rivet-bottom-right" />

              {/* Status indicator row */}
              <div className="flex items-center gap-3 mb-4">
                {busy ? (
                  <>
                    <div className="piston-loader scale-75 origin-left" aria-label="Generating..." />
                    <span className="font-heading text-sm tracking-[0.15em] text-brass uppercase">Forging</span>
                  </>
                ) : isComplete ? (
                  <>
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-brass/70 bg-brass/15">
                      <svg className="h-3 w-3 text-brass" fill="none" viewBox="0 0 24 24">
                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="m5 13 4 4L19 7" />
                      </svg>
                    </div>
                    <span className="font-heading text-sm tracking-[0.15em] text-brass uppercase">Complete</span>
                  </>
                ) : (
                  <>
                    <div className="h-2 w-2 rounded-full bg-destructive/80" />
                    <span className="font-heading text-sm tracking-[0.15em] text-destructive uppercase">Error</span>
                  </>
                )}
              </div>

              <p className="text-sm text-steam/85 leading-relaxed">
                {statusText}
              </p>

              {/* Cover image status */}
              {!pageLoading && (busy || isComplete) && !hasImage && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-white/20"
                      style={{ animation: 'pulse 2s ease-in-out infinite' }}
                    />
                    <span className="text-sm text-steam/80">Cover art being forged in the background...</span>
                  </div>
                </div>
              )}

              {error && (
                <p className="mt-4 text-sm text-destructive/90 border-t border-destructive/20 pt-4">
                  {error}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              {isComplete && (
                <Button
                  className="w-full"
                  onClick={() => router.push(`/campaign/${campaign.id}/lobby`)}
                >
                  Enter Lobby
                </Button>
              )}

              {(campaign?.status === 'error' || (error && !busy)) && (
                <Button
                  type="button"
                  onClick={handleRetryGeneration}
                  disabled={isRetrying}
                  className="w-full"
                >
                  {isRetrying ? 'Retrying...' : 'Retry Generation'}
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/')}
                className="w-full"
              >
                Back Home
              </Button>
            </div>

          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ── "Painting Your World" shimmer sweep ── */
        @keyframes text-shimmer {
          0%   { background-position: -250% center; }
          100% { background-position: 250% center; }
        }
        @keyframes forge-glow {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(196,148,61,0.15)); }
          50%       { filter: drop-shadow(0 0 14px rgba(232,168,53,0.55)) drop-shadow(0 0 28px rgba(196,148,61,0.2)); }
        }
        .painting-text {
          letter-spacing: 0.3em;
          background: linear-gradient(
            90deg,
            rgba(196,148,61,0.28) 0%,
            rgba(196,148,61,0.28) 15%,
            rgba(232,168,53,0.92) 35%,
            rgba(255,218,120,1)   50%,
            rgba(232,168,53,0.92) 65%,
            rgba(196,148,61,0.28) 85%,
            rgba(196,148,61,0.28) 100%
          );
          background-size: 250% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: text-shimmer 2.8s linear infinite, forge-glow 2.8s ease-in-out infinite;
        }

        /* ── Paint stroke bar (under "Painting Your World") ── */
        @keyframes stroke-paint {
          0%   { background-position: -150% center; }
          100% { background-position: 150% center; }
        }
        .paint-stroke-bar {
          width: 48px;
          height: 3px;
          border-radius: 2px;
          background: linear-gradient(
            90deg,
            rgba(184,115,51,0.2) 0%,
            rgba(232,168,53,0.9) 40%,
            rgba(255,218,120,1)  50%,
            rgba(232,168,53,0.9) 60%,
            rgba(184,115,51,0.2) 100%
          );
          background-size: 200% auto;
          animation: stroke-paint 2.8s linear infinite;
          box-shadow: 0 0 8px rgba(196,148,61,0.35);
        }

      `}</style>
    </main>
  )
}
