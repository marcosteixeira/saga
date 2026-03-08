import { describe, it, expect } from 'vitest'
import { extractNarration } from '../anthropic.ts'

describe('extractNarration', () => {
  it('returns narration from a first-call response', () => {
    const response = {
      world_context: { history: 'Long history', factions: 'Many factions', tone: 'Dark' },
      opening_situation: 'You find yourselves at the gate.',
      starting_hooks: ['The gate is sealed.', 'A figure watches.', 'Smoke rises.'],
      actions: [],
      narration: ['The iron gate looms.', 'Rain begins to fall.'],
    }
    expect(extractNarration(response)).toEqual(['The iron gate looms.', 'Rain begins to fall.'])
  })

  it('returns narration from a round response', () => {
    const response = {
      actions: [{ clientId: 'x', playerName: 'Aria', content: 'I draw my sword.' }],
      narration: ['Aria draws her blade with a sharp ring.'],
    }
    expect(extractNarration(response)).toEqual(['Aria draws her blade with a sharp ring.'])
  })

  it('returns empty array when narration is missing', () => {
    expect(extractNarration({})).toEqual([])
  })
})
