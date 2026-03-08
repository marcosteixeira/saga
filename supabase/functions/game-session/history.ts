import { buildFirstCallInput } from './prompt.ts'

export interface MsgRow {
  content: string
  type: 'action' | 'narration'
  players: { character_name: string | null; username: string | null } | null
}

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string
}

export function buildMessageHistory(rows: MsgRow[]): AnthropicMessage[] {
  if (!rows.length) return []

  const history: AnthropicMessage[] = []
  let actionBatch: Array<{ playerName: string; content: string }> = []

  for (const row of rows) {
    if (row.type === 'narration') {
      if (history.length === 0) {
        // First narration: prepend the synthetic first-call user message
        history.push({ role: 'user', content: buildFirstCallInput() })
      } else if (actionBatch.length > 0) {
        history.push({ role: 'user', content: JSON.stringify(actionBatch) })
        actionBatch = []
      }
      history.push({ role: 'assistant', content: row.content })
    } else if (row.type === 'action') {
      const playerName =
        row.players?.character_name ?? row.players?.username ?? 'Unknown'
      actionBatch.push({ playerName, content: row.content })
    }
  }

  return history
}
