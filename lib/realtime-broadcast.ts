import type { Player } from '@/types/player'

async function broadcastToTopic(
  topic: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return

  try {
    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        messages: [{ topic, event, payload }],
      }),
    })
  } catch {
    // Broadcast failures must never crash the caller.
  }
}

export async function broadcastCampaignEvent(
  campaignId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  await broadcastToTopic(`campaign:${campaignId}`, event, payload)
}

export async function broadcastPlayerJoin(campaignId: string, player: Player): Promise<void> {
  await broadcastToTopic(`campaign:${campaignId}`, 'player:joined', player as unknown as Record<string, unknown>)
}

export async function broadcastPlayerUpdate(campaignId: string, player: Player): Promise<void> {
  await broadcastToTopic(`campaign:${campaignId}`, 'player:updated', player as unknown as Record<string, unknown>)
}

export async function broadcastGameEvent(
  campaignId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  await broadcastToTopic(`game:${campaignId}`, event, payload)
}
