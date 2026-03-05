import type { Player } from '@/types/player'

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
  } catch {
    // Broadcast failures must never crash the API route
  }
}
