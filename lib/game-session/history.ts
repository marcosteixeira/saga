// lib/game-session/history.ts
import type { MsgRow, AnthropicMessage } from './types'
import { buildFirstCallInput } from './prompt'

export function buildMessageHistory(rows: MsgRow[]): AnthropicMessage[] {
  if (!rows.length) return []

  const firstActionIdx = rows.findIndex((r) => r.type === 'action')
  const openingEnd = firstActionIdx === -1 ? rows.length : firstActionIdx
  const openingParts = rows
    .slice(0, openingEnd)
    .filter((r) => r.type === 'narration')
    .map((r) => r.content)

  if (!openingParts.length) return []

  const history: AnthropicMessage[] = []
  history.push({ role: 'user', content: buildFirstCallInput() })
  history.push({
    role: 'assistant',
    content: JSON.stringify({
      world_context: { history: '', factions: '', tone: '' },
      opening_situation: '',
      starting_hooks: [],
      actions: [],
      narration: openingParts,
    }),
  })

  if (firstActionIdx === -1) return history

  let actionBatch: Array<{ playerName: string; content: string }> = []
  for (let i = firstActionIdx; i < rows.length; i++) {
    const row = rows[i]
    if (row.type === 'narration') {
      if (actionBatch.length > 0) {
        history.push({ role: 'user', content: JSON.stringify(actionBatch) })
        actionBatch = []
        history.push({ role: 'assistant', content: row.content })
      } else {
        const last = history[history.length - 1]
        if (last.role === 'assistant') {
          last.content = (last.content as string) + '\n\n' + row.content
        } else {
          history.push({ role: 'assistant', content: row.content })
        }
      }
    } else if (row.type === 'action') {
      const playerName = row.players?.character_name ?? row.players?.username ?? 'Unknown'
      actionBatch.push({ playerName, content: row.content })
    }
  }

  return history
}
