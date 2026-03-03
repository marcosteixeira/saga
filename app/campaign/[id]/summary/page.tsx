'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import type { Campaign } from '@/types'

interface SessionData {
  id: string
  session_number: number
  summary_md: string | null
  ended_at: string | null
}

export default function SessionSummaryPage() {
  const { id: campaignId } = useParams<{ id: string }>()
  const router = useRouter()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [session, setSession] = useState<SessionData | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEnding, setIsEnding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [campaignRes, userRes] = await Promise.all([
        fetch(`/api/campaign/${campaignId}`).then((r) => r.json()),
        supabase.auth.getUser(),
      ])

      const campaignData: Campaign = campaignRes.campaign
      setCampaign(campaignData)
      setCurrentUserId(userRes.data.user?.id ?? null)

      // Load most recent session
      const { data: sessionData } = await supabase
        .from('sessions')
        .select('id, session_number, summary_md, ended_at')
        .eq('campaign_id', campaignId)
        .order('session_number', { ascending: false })
        .limit(1)
        .single()

      setSession(sessionData)
      setIsLoading(false)
    }
    load()
  }, [campaignId])

  async function handleContinueCampaign() {
    router.push(`/campaign/${campaignId}/lobby`)
  }

  async function handleEndCampaign() {
    setIsEnding(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaign/${campaignId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ended' }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error ?? 'Failed to end campaign')
        return
      }
      router.push(`/campaign/${campaignId}/lobby`)
    } finally {
      setIsEnding(false)
    }
  }

  const isHost = campaign?.host_user_id === currentUserId

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center" style={{ background: '#0d0c0a' }}>
        <p className="animate-pulse font-mono text-[--ash]">Loading summary...</p>
      </main>
    )
  }

  return (
    <main
      className="relative min-h-screen"
      style={{
        background:
          'radial-gradient(ellipse at bottom center, rgba(212,98,42,0.06) 0%, transparent 60%), #0d0c0a',
      }}
    >
      {/* Grain texture */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Crect width='1' height='1' fill='%23fff'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Cover image header */}
      {campaign?.cover_image_url && (
        <div className="relative h-64 w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={campaign.cover_image_url}
            alt={campaign.name}
            className="h-full w-full object-cover opacity-40"
          />
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to bottom, transparent 30%, #0d0c0a 100%)',
            }}
          />
        </div>
      )}

      <div className="mx-auto max-w-3xl px-6 py-12">
        {/* Session title */}
        <div className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[--copper]">
          {campaign?.name}
        </div>
        <h1
          className="mb-10 uppercase tracking-[0.15em]"
          style={{
            fontFamily: 'Pragati Narrow, sans-serif',
            fontSize: 'clamp(2rem, 6vw, 3.5rem)',
            fontWeight: 700,
            color: 'var(--brass)',
            textShadow: '0 0 40px rgba(196,148,61,0.4)',
          }}
        >
          Session {session?.session_number ?? '?'} Summary
        </h1>

        {/* Iron Plate panel with rivet corners */}
        <div
          className="relative mb-8 border border-[--gunmetal] p-8"
          style={{
            background: 'rgba(42,37,32,0.85)',
            clipPath:
              'polygon(12px 0%, calc(100% - 12px) 0%, 100% 12px, 100% calc(100% - 12px), calc(100% - 12px) 100%, 12px 100%, 0% calc(100% - 12px), 0% 12px)',
            boxShadow:
              'inset 1px 1px 0 rgba(255,255,255,0.04), 0 8px 40px rgba(0,0,0,0.6)',
          }}
        >
          {/* Rivet corners */}
          {['top-3 left-3', 'top-3 right-3', 'bottom-3 left-3', 'bottom-3 right-3'].map((pos) => (
            <div
              key={pos}
              className={`absolute ${pos} h-2 w-2 rounded-full`}
              style={{
                background: 'radial-gradient(circle at 35% 35%, #6b5d52, #1a1814)',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8)',
              }}
            />
          ))}

          {session?.summary_md ? (
            <div
              className="leading-relaxed"
              style={{
                fontFamily: 'Rokkitt, serif',
                color: 'var(--steam)',
                fontSize: '1.05rem',
                lineHeight: '1.8',
                whiteSpace: 'pre-wrap',
              }}
            >
              {session.summary_md}
            </div>
          ) : (
            <p className="italic text-[--ash]">No summary available for this session.</p>
          )}
        </div>

        {/* Host controls */}
        {isHost ? (
          <div className="flex flex-col gap-4 sm:flex-row">
            {/* Continue Campaign — Primary brass button */}
            <button
              onClick={handleContinueCampaign}
              className="flex-1 px-6 py-3 text-center font-mono text-sm uppercase tracking-widest transition-all"
              style={{
                fontFamily: 'Share Tech Mono, monospace',
                background: 'linear-gradient(135deg, var(--copper), var(--brass), var(--copper))',
                color: '#0d0c0a',
                clipPath:
                  'polygon(8px 0%, calc(100% - 8px) 0%, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0% calc(100% - 8px), 0% 8px)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 8px rgba(0,0,0,0.4)',
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background =
                  'linear-gradient(135deg, var(--furnace), var(--amber), var(--furnace))'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background =
                  'linear-gradient(135deg, var(--copper), var(--brass), var(--copper))'
              }}
            >
              Continue Campaign
            </button>

            {/* End Campaign — Destructive rusted red */}
            <button
              onClick={handleEndCampaign}
              disabled={isEnding}
              className="flex-1 px-6 py-3 text-center font-mono text-sm uppercase tracking-widest transition-all disabled:opacity-50"
              style={{
                fontFamily: 'Share Tech Mono, monospace',
                background: '#6b2218',
                color: 'var(--steam)',
                clipPath:
                  'polygon(8px 0%, calc(100% - 8px) 0%, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0% calc(100% - 8px), 0% 8px)',
                border: '1px solid #a63d2a',
              }}
              onMouseOver={(e) => {
                if (!isEnding)
                  e.currentTarget.style.background = '#a63d2a'
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = '#6b2218'
              }}
            >
              {isEnding ? 'Ending...' : 'End Campaign'}
            </button>
          </div>
        ) : (
          <p
            className="animate-pulse text-center italic text-[--ash]"
            style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
          >
            Waiting for the host to decide...
          </p>
        )}

        {error && (
          <p className="mt-4 text-center font-mono text-sm text-red-400">{error}</p>
        )}
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Pragati+Narrow:wght@700&family=Rokkitt:wght@400;500&family=Barlow+Condensed:wght@400;500&family=Share+Tech+Mono&display=swap');

        :root {
          --soot: #0d0c0a;
          --iron: #1a1814;
          --smog: #2a2520;
          --gunmetal: #3d3630;
          --ash: #6b5d52;
          --brass: #c4943d;
          --copper: #b87333;
          --amber: #e8a835;
          --furnace: #d4622a;
          --steam: #d4cabb;
          --patina: #5a7a6d;
        }
      `}</style>
    </main>
  )
}
