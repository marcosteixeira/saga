import type { Message, Player } from '@/types'

export function formatMessageHistory(
  messages: Message[],
  players: Player[]
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const result: Array<{ role: 'user' | 'assistant'; content: string }> = []

  let pendingActions: string[] = []

  function flushActions() {
    if (pendingActions.length > 0) {
      result.push({ role: 'user', content: pendingActions.join('\n') })
      pendingActions = []
    }
  }

  for (const message of messages) {
    if (message.type === 'narration') {
      flushActions()
      result.push({ role: 'assistant', content: message.content })
    } else if (message.type === 'action') {
      const player = players.find(p => p.id === message.player_id)
      const name = player?.character_name ?? player?.username ?? 'Unknown'
      pendingActions.push(`${name}: ${message.content}`)
    }
    // Skip 'system' and 'ooc' messages
  }

  flushActions()

  return result
}
