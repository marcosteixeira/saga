import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

export type RealtimePayload = RealtimePostgresChangesPayload<Record<string, unknown>>

export function subscribeToPlayers(
  campaignId: string,
  onPlayerChange: (payload: RealtimePayload) => void
): RealtimeChannel {
  const supabase = createClient()
  return supabase
    .channel(`lobby:${campaignId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'players',
        filter: `campaign_id=eq.${campaignId}`,
      },
      onPlayerChange
    )
    .subscribe()
}

export function unsubscribeFromChannel(channel: RealtimeChannel): void {
  const supabase = createClient()
  supabase.removeChannel(channel)
}
