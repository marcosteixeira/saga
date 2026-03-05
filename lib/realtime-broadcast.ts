import type { Player } from '@/types/player'

export async function broadcastPlayerJoin(
  campaignId: string,
  player: Player
): Promise<void> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) return

    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `campaign:${campaignId}`,
            event: 'player:joined',
            payload: player,
          },
        ],
      }),
    })
    // Non-2xx responses are intentionally ignored — broadcast is fire-and-forget
  } catch {
    // Broadcast failures must never crash the API route
  }
}

export async function broadcastPlayerUpdate(
  campaignId: string,
  player: Player
): Promise<void> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) return

    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `campaign:${campaignId}`,
            event: 'player:updated',
            payload: player,
          },
        ],
      }),
    })
    // Non-2xx responses are intentionally ignored — broadcast is fire-and-forget
    // fetch() does not throw on HTTP error status codes, only on network failures
  } catch {
    // Broadcast failures must never crash the API route
  }
}
