export interface PendingMessage {
  clientId: string
  playerId: string
  playerName: string
  content: string
  clientTimestamp: number
}

export interface CampaignSession {
  connections: Map<string, WebSocket>  // playerId → socket
  pendingMessages: PendingMessage[]
  debounceTimer: ReturnType<typeof setTimeout> | null
  isProcessing: boolean  // true while waiting for OpenAI / saving to DB
  nextRoundMessages: PendingMessage[]  // messages queued during active processing
}

export const sessions = new Map<string, CampaignSession>()

export function getOrCreateSession(campaignId: string): CampaignSession {
  let session = sessions.get(campaignId)
  if (!session) {
    session = {
      connections: new Map(),
      pendingMessages: [],
      debounceTimer: null,
      isProcessing: false,
      nextRoundMessages: [],
    }
    sessions.set(campaignId, session)
  }
  return session
}

export function registerConnection(campaignId: string, playerId: string, socket: WebSocket): void {
  const session = getOrCreateSession(campaignId)
  const previous = session.connections.get(playerId)
  if (previous && previous !== socket) {
    try {
      previous.close(1000, "replaced_by_new_connection")
    } catch {
      // ignore close errors on stale sockets
    }
  }
  session.connections.set(playerId, socket)
}

export function removeConnection(campaignId: string, playerId: string, socket?: WebSocket): void {
  const session = sessions.get(campaignId)
  if (!session) return
  const current = session.connections.get(playerId)
  if (!current) return
  if (socket && current !== socket) return
  session.connections.delete(playerId)
  if (session.connections.size === 0 && session.pendingMessages.length === 0 && !session.isProcessing) {
    sessions.delete(campaignId)
  }
}

export function broadcastToAll(campaignId: string, message: unknown, excludePlayerId?: string): void {
  const session = sessions.get(campaignId)
  if (!session) return
  const payload = JSON.stringify(message)
  for (const [playerId, socket] of session.connections) {
    if (playerId === excludePlayerId) continue
    try {
      socket.send(payload)
    } catch {
      // ignore — stale sockets will be cleaned up on close events
    }
  }
}
