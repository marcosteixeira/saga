import { describe, it, expect } from 'vitest'
import { formatMessageHistory } from '../message-history'
import type { Message, Player } from '@/types'

function makeMessage(overrides: Partial<Message>): Message {
  return {
    id: 'msg-1',
    campaign_id: 'c1',
    session_id: 's1',
    player_id: null,
    content: 'test',
    type: 'narration',
    image_url: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function makePlayer(overrides: Partial<Player>): Player {
  return {
    id: 'p1',
    campaign_id: 'c1',
    session_token: 'token',
    username: 'hero',
    character_name: null,
    character_class: null,
    character_backstory: null,
    character_image_url: null,
    stats: { hp: 20, hp_max: 20 },
    status: 'active',
    absence_mode: 'skip',
    is_host: false,
    last_seen_at: new Date().toISOString(),
    joined_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('formatMessageHistory', () => {
  it('converts narration to assistant messages', () => {
    const messages = [
      makeMessage({ id: 'm1', type: 'narration', content: 'You enter the dungeon.' }),
    ]
    const result = formatMessageHistory(messages, [])
    expect(result).toEqual([{ role: 'assistant', content: 'You enter the dungeon.' }])
  })

  it('converts actions to user messages with player names', () => {
    const player = makePlayer({ id: 'p1', username: 'alice', character_name: 'Elara' })
    const messages = [
      makeMessage({ id: 'm1', type: 'action', content: 'I attack the goblin', player_id: 'p1' }),
    ]
    const result = formatMessageHistory(messages, [player])
    expect(result).toEqual([{ role: 'user', content: 'Elara: I attack the goblin' }])
  })

  it('combines consecutive actions into one user message', () => {
    const player1 = makePlayer({ id: 'p1', username: 'alice', character_name: 'Elara' })
    const player2 = makePlayer({ id: 'p2', username: 'bob', character_name: 'Theron' })
    const messages = [
      makeMessage({ id: 'm1', type: 'action', content: 'I cast fireball', player_id: 'p1' }),
      makeMessage({ id: 'm2', type: 'action', content: 'I charge forward', player_id: 'p2' }),
    ]
    const result = formatMessageHistory(messages, [player1, player2])
    expect(result).toHaveLength(1)
    expect(result[0].role).toBe('user')
    expect(result[0].content).toContain('Elara: I cast fireball')
    expect(result[0].content).toContain('Theron: I charge forward')
  })

  it('skips system and ooc messages', () => {
    const messages = [
      makeMessage({ id: 'm1', type: 'system', content: 'Session started' }),
      makeMessage({ id: 'm2', type: 'narration', content: 'The quest begins.' }),
      makeMessage({ id: 'm3', type: 'ooc', content: 'brb', player_id: 'p1' }),
    ]
    const result = formatMessageHistory(messages, [])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ role: 'assistant', content: 'The quest begins.' })
  })

  it('handles empty message list', () => {
    const result = formatMessageHistory([], [])
    expect(result).toEqual([])
  })

  it('alternates user/assistant correctly for Claude', () => {
    const player = makePlayer({ id: 'p1', username: 'hero', character_name: null })
    const messages = [
      makeMessage({ id: 'm1', type: 'narration', content: 'Narration 1' }),
      makeMessage({ id: 'm2', type: 'action', content: 'Action 1', player_id: 'p1' }),
      makeMessage({ id: 'm3', type: 'narration', content: 'Narration 2' }),
      makeMessage({ id: 'm4', type: 'action', content: 'Action 2', player_id: 'p1' }),
    ]
    const result = formatMessageHistory(messages, [player])
    expect(result.map(m => m.role)).toEqual(['assistant', 'user', 'assistant', 'user'])
  })
})
