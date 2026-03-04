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
    <div className="iron-plate p-8 max-w-2xl mx-auto">
      <div className="rivet-bottom-left" />
      <div className="rivet-bottom-right" />
      <h1 className="display-title text-4xl mb-4">
        {campaign.name}
      </h1>
      <div className="brass-pipe mx-auto mb-6 w-24" />
      <ScrollArea className="h-96 mb-6">
        <pre className="text-steam text-sm leading-relaxed whitespace-pre-wrap">
          {worldContent}
        </pre>
      </ScrollArea>
      <Button className="w-full" onClick={() => router.push(`/campaign/${campaign.id}/lobby`)}>
        Enter Lobby
      </Button>
    </div>
  )
}
