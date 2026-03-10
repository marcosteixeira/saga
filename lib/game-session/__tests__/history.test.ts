// lib/game-session/__tests__/history.test.ts
import { describe, it, expect } from 'vitest'
import { buildMessageHistory } from '../history'
import type { MsgRow } from '../types'

describe('buildMessageHistory', () => {
  it('returns empty array for no rows', () => {
    expect(buildMessageHistory([])).toEqual([])
  })

  it('wraps opening narration in first-call shape', () => {
    const rows: MsgRow[] = [
      { content: 'The tavern buzzes.', type: 'narration', players: null },
    ]
    const history = buildMessageHistory(rows)
    expect(history).toHaveLength(2)
    expect(history[0].role).toBe('user')
    expect(history[1].role).toBe('assistant')
    const parsed = JSON.parse(history[1].content as string)
    expect(parsed.narration).toEqual(['The tavern buzzes.'])
  })

  it('groups actions into a user message and narration into assistant message', () => {
    const rows: MsgRow[] = [
      { content: 'Opening.', type: 'narration', players: null },
      { content: 'I attack!', type: 'action', players: { character_name: 'Aria', username: null } },
      { content: 'She misses.', type: 'narration', players: null },
    ]
    const history = buildMessageHistory(rows)
    // [user:first-call-input, assistant:opening, user:actions, assistant:narration]
    expect(history).toHaveLength(4)
    expect(history[2].role).toBe('user')
    const actions = JSON.parse(history[2].content as string)
    expect(actions[0].playerName).toBe('Aria')
    expect(actions[0].content).toBe('I attack!')
    expect(history[3].content).toBe('She misses.')
  })
})
