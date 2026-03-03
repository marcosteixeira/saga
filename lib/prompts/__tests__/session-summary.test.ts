import { describe, it, expect } from 'vitest'
import { buildSessionSummaryPrompt } from '../session-summary'
import type { Message } from '@/types'
import type { Player } from '@/types'

describe('buildSessionSummaryPrompt', () => {
  it('includes all player character names in the prompt', () => {
    const players = [
      { character_name: 'Gandalf' } as Player,
      { character_name: 'Aragorn' } as Player,
    ]
    const result = buildSessionSummaryPrompt([], players)
    expect(result).toContain('Gandalf')
    expect(result).toContain('Aragorn')
  })

  it('includes message content for context', () => {
    const messages = [
      { content: 'The dragon breathes fire', type: 'narration' } as Message,
      { content: 'I dodge the flames', type: 'action' } as Message,
    ]
    const result = buildSessionSummaryPrompt(messages, [])
    expect(result).toContain('The dragon breathes fire')
    expect(result).toContain('I dodge the flames')
  })

  it('specifies 400-600 word prose format', () => {
    const result = buildSessionSummaryPrompt([], [])
    expect(result).toMatch(/400.*600|prose|narrative/i)
  })
})
