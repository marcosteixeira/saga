export type BroadcastPayload = Record<string, unknown>

export async function broadcastToChannel(
  supabaseUrl: string,
  serviceRoleKey: string,
  campaignId: string,
  event: string,
  payload: BroadcastPayload,
): Promise<void> {
  try {
    const response = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        messages: [{
          topic: `campaign:${campaignId}`,
          event,
          payload,
        }],
      }),
    })
    if (!response.ok) {
      console.error(
        `[broadcastToChannel] HTTP ${response.status} for campaign:${campaignId} event:${event}`
      )
    }
  } catch (err) {
    console.error(
      `[broadcastToChannel] fetch threw for campaign:${campaignId} event:${event}`,
      err,
    )
  }
}
