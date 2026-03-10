// lib/game-session/__tests__/prompt.test.ts
import { describe, it, expect } from 'vitest'
import { buildGMSystemPrompt, isFirstCallResponse, buildFirstCallInput } from '../prompt'

describe('buildFirstCallInput', () => {
  it('returns a non-empty string', () => {
    expect(typeof buildFirstCallInput()).toBe('string')
    expect(buildFirstCallInput().length).toBeGreaterThan(0)
  })
})

describe('isFirstCallResponse', () => {
  it('returns true for valid first-call response', () => {
    expect(isFirstCallResponse({
      world_context: { history: '', factions: '', tone: '' },
      narration: ['hello'],
    })).toBe(true)
  })

  it('returns false for null', () => {
    expect(isFirstCallResponse(null)).toBe(false)
  })

  it('returns false when world_context is missing', () => {
    expect(isFirstCallResponse({ narration: [] })).toBe(false)
  })

  it('returns false when world_context is not an object', () => {
    expect(isFirstCallResponse({ world_context: 42 })).toBe(false)
  })
})

describe('buildGMSystemPrompt', () => {
  it('includes player name in output', () => {
    const result = buildGMSystemPrompt('A dark world.', [
      { character_name: 'Aria', character_class: 'Rogue', character_backstory: null },
    ])
    expect(result).toContain('Aria')
    expect(result).toContain('Rogue')
  })

  it('falls back to username when character_name is null', () => {
    const result = buildGMSystemPrompt('World.', [
      { character_name: null, character_class: null, character_backstory: null, username: 'player1' },
    ])
    expect(result).toContain('player1')
  })
})
