export type BroadcastPayload = Record<string, unknown>

export async function broadcastToChannel(
  supabaseUrl: string,
  serviceRoleKey: string,
  channel: string,
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
          topic: channel,
          event,
          payload,
        }],
      }),
    })
    if (!response.ok) {
      console.error(
        `[broadcastToChannel] HTTP ${response.status} for ${channel} event:${event}`
      )
    }
  } catch (err) {
    console.error(
      `[broadcastToChannel] fetch threw for ${channel} event:${event}`,
      err,
    )
  }
}
