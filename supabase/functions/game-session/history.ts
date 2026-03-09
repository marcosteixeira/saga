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

  // All narration rows before the first action belong to the opening scene.
  // They must be wrapped in the first-call JSON shape so the model recognises
  // that the opening round is complete and subsequent responses should be plain
  // prose (not JSON again).
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

  // Nothing left to process if there are no action rows.
  if (firstActionIdx === -1) return history

  // Process rounds: actions flush into a user message, then narration becomes
  // the assistant reply. Consecutive narration rows with no pending actions are
  // merged (same round, multiple paragraphs).
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
          last.content = last.content + '\n\n' + row.content
        } else {
          history.push({ role: 'assistant', content: row.content })
        }
      }
    } else if (row.type === 'action') {
      const playerName =
        row.players?.character_name ?? row.players?.username ?? 'Unknown'
      actionBatch.push({ playerName, content: row.content })
    }
  }

  return history
}
