import { describe, it, expect } from 'vitest'
import { buildMessageHistory } from '../history.ts'
import { buildFirstCallInput } from '../prompt.ts'

// Simulate DB rows as returned by Supabase nested select
interface MsgRow {
  content: string
  type: 'action' | 'narration'
  players: { character_name: string | null; username: string | null } | null
}

describe('buildMessageHistory', () => {
  it('returns empty array when no messages', () => {
    expect(buildMessageHistory([])).toEqual([])
  })

  it('wraps opening narration with first-call user message', () => {
    const rows: MsgRow[] = [
      { type: 'narration', content: 'The story begins.', players: null },
    ]
    const history = buildMessageHistory(rows)
    expect(history).toHaveLength(2)
    expect(history[0]).toEqual({ role: 'user', content: buildFirstCallInput() })
    expect(history[1]).toEqual({ role: 'assistant', content: 'The story begins.' })
  })

  it('batches consecutive actions into a single user message', () => {
    const rows: MsgRow[] = [
      { type: 'narration', content: 'Opening.', players: null },
      { type: 'action', content: 'I draw my sword.', players: { character_name: 'Aria', username: null } },
      { type: 'action', content: 'I raise my shield.', players: { character_name: 'Brom', username: null } },
      { type: 'narration', content: 'Round 1 narration.', players: null },
    ]
    const history = buildMessageHistory(rows)
    // user(firstCall), assistant(opening), user(batch), assistant(round1)
    expect(history).toHaveLength(4)
    expect(history[2].role).toBe('user')
    const batch = JSON.parse(history[2].content as string)
    expect(batch).toHaveLength(2)
    expect(batch[0]).toEqual({ playerName: 'Aria', content: 'I draw my sword.' })
    expect(batch[1]).toEqual({ playerName: 'Brom', content: 'I raise my shield.' })
    expect(history[3]).toEqual({ role: 'assistant', content: 'Round 1 narration.' })
  })

  it('falls back to username when character_name is null', () => {
    const rows: MsgRow[] = [
      { type: 'narration', content: 'Opening.', players: null },
      { type: 'action', content: 'I run.', players: { character_name: null, username: 'marcos' } },
      { type: 'narration', content: 'Narration.', players: null },
    ]
    const history = buildMessageHistory(rows)
    const batch = JSON.parse(history[2].content as string)
    expect(batch[0].playerName).toBe('marcos')
  })

  it('uses Unknown when both character_name and username are null', () => {
    const rows: MsgRow[] = [
      { type: 'narration', content: 'Opening.', players: null },
      { type: 'action', content: 'I act.', players: null },
      { type: 'narration', content: 'Narration.', players: null },
    ]
    const history = buildMessageHistory(rows)
    const batch = JSON.parse(history[2].content as string)
    expect(batch[0].playerName).toBe('Unknown')
  })

  it('handles multiple rounds correctly', () => {
    const rows: MsgRow[] = [
      { type: 'narration', content: 'Opening.', players: null },
      { type: 'action', content: 'Act 1.', players: { character_name: 'Aria', username: null } },
      { type: 'narration', content: 'Round 1.', players: null },
      { type: 'action', content: 'Act 2.', players: { character_name: 'Aria', username: null } },
      { type: 'narration', content: 'Round 2.', players: null },
    ]
    const history = buildMessageHistory(rows)
    // user(firstCall), assistant(opening), user(batch1), assistant(r1), user(batch2), assistant(r2)
    expect(history).toHaveLength(6)
    expect(history[4].role).toBe('user')
    expect(history[5]).toEqual({ role: 'assistant', content: 'Round 2.' })
  })
})
