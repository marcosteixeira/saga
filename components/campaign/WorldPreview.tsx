'use client'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import type { Campaign } from '@/types'

interface Props {
  campaign: Campaign
  worldContent: string
}

export function WorldPreview({ campaign, worldContent }: Props) {
  const router = useRouter()
  const [coverUrl, setCoverUrl] = useState<string | null>(campaign.cover_image_url)
  const [mapUrl, setMapUrl] = useState<string | null>(campaign.map_image_url)
  const attemptsRef = useRef(0)
  const MAX_ATTEMPTS = 10

  useEffect(() => {
    if (coverUrl && mapUrl) return

    const poll = async () => {
      if (attemptsRef.current >= MAX_ATTEMPTS) return
      attemptsRef.current += 1

      try {
        const res = await fetch(`/api/campaign/${campaign.id}`)
        if (!res.ok) return
        const json = await res.json()
        const data: Campaign = json.campaign
        if (data.cover_image_url) setCoverUrl(data.cover_image_url)
        if (data.map_image_url) setMapUrl(data.map_image_url)
      } catch {
        // ignore
      }
    }

    const interval = setInterval(poll, 5000)
    return () => clearInterval(interval)
  }, [campaign.id, coverUrl, mapUrl])

  return (
    <div className="rounded border border-[--gunmetal] bg-[--smog]/85 p-8 max-w-2xl mx-auto">
      <h1
        className="font-display text-4xl uppercase text-[--brass] mb-6"
        style={{ textShadow: '0 0 20px rgba(196,148,61,0.4)' }}
      >
        {campaign.name}
      </h1>

      {/* Cover Image */}
      <div className="mb-6 rounded overflow-hidden border border-[--gunmetal]">
        {coverUrl ? (
          <div className="relative">
            <img
              src={coverUrl}
              alt={`${campaign.name} cover art`}
              className="w-full h-56 object-cover"
            />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse at center, transparent 40%, rgba(10,10,10,0.3) 100%)',
              }}
            />
          </div>
        ) : (
          <Skeleton className="w-full h-56 bg-[--gunmetal]" style={{
            backgroundImage: 'linear-gradient(90deg, var(--gunmetal) 25%, var(--smog) 50%, var(--gunmetal) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
          }} />
        )}
      </div>

      <ScrollArea className="h-64 mb-6">
        <pre className="font-body text-[--steam] text-sm leading-relaxed whitespace-pre-wrap">
          {worldContent}
        </pre>
      </ScrollArea>

      {/* Map Image */}
      <div className="mb-6 rounded overflow-hidden border-2 border-[--copper]">
        {mapUrl ? (
          <div className="relative">
            <img
              src={mapUrl}
              alt={`${campaign.name} world map`}
              className="w-full h-56 object-cover"
            />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse at center, transparent 40%, rgba(10,10,10,0.3) 100%)',
              }}
            />
          </div>
        ) : (
          <Skeleton className="w-full h-56 bg-[--gunmetal]" style={{
            backgroundImage: 'linear-gradient(90deg, var(--gunmetal) 25%, var(--smog) 50%, var(--gunmetal) 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
          }} />
        )}
      </div>

      <Button className="w-full" onClick={() => router.push(`/campaign/${campaign.id}/lobby`)}>
        Enter Lobby
      </Button>
    </div>
  )
}
