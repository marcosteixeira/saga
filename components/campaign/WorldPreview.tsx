'use client'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import type { Campaign } from '@/types'

interface Props {
  campaign: Campaign
  worldContent: string
}

export function WorldPreview({ campaign, worldContent }: Props) {
  const router = useRouter()
  return (
    <div className="rounded border border-[--gunmetal] bg-[--smog]/85 p-8 max-w-2xl mx-auto">
      <h1 className="font-display text-4xl uppercase text-[--brass] mb-6"
          style={{ textShadow: '0 0 20px rgba(196,148,61,0.4)' }}>
        {campaign.name}
      </h1>
      <ScrollArea className="h-96 mb-6">
        <pre className="font-body text-[--steam] text-sm leading-relaxed whitespace-pre-wrap">
          {worldContent}
        </pre>
      </ScrollArea>
      <Button className="w-full" onClick={() => router.push(`/campaign/${campaign.id}/lobby`)}>
        Enter Lobby
      </Button>
    </div>
  )
}
