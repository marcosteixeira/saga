interface Action {
  clientId: string
  playerName: string
  content: string
}

interface DbMessage {
  id: string
  campaign_id: string
  player_id: string | null
  content: string
  type: 'action' | 'narration' | 'system' | 'ooc'
  created_at: string
}

export function buildRoundMessages({
  actions,
  savedMessages,
  clientIdToPlayerId,
}: {
  actions: Action[]
  savedMessages: DbMessage[]
  clientIdToPlayerId: Map<string, string>
}): Array<{ clientId: string | null; dbMessage: DbMessage }> {
  const savedActions = savedMessages.filter((m) => m.type === 'action')
  const savedNarration = savedMessages.filter((m) => m.type === 'narration')

  // Use FIFO buckets per (player_id, content) so duplicate content maps correctly.
  const keyToClientIds = new Map<string, string[]>()
  for (const a of actions) {
    const playerId = clientIdToPlayerId.get(a.clientId)
    if (!playerId) continue
    const key = `${playerId}:${a.content}`
    const existing = keyToClientIds.get(key)
    if (existing) {
      existing.push(a.clientId)
    } else {
      keyToClientIds.set(key, [a.clientId])
    }
  }

  return [
    ...savedActions.map((m) => {
      if (!m.player_id) {
        return { clientId: null, dbMessage: m }
      }
      const key = `${m.player_id}:${m.content}`
      const queue = keyToClientIds.get(key)
      const mappedClientId = queue && queue.length > 0 ? queue.shift() ?? null : null
      return { clientId: mappedClientId, dbMessage: m }
    }),
    ...savedNarration.map((m) => ({ clientId: null, dbMessage: m })),
  ]
}
