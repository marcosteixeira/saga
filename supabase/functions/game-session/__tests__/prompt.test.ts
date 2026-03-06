import { describe, it, expect } from 'vitest'
import { buildGMSystemPrompt, buildFirstCallInput, isFirstCallResponse } from '../prompt.ts'

const world = {
  world_content: 'A dying empire of iron and ash. Geography: jagged mountains and fog-filled valleys.',
}

const players = [
  { character_name: 'Aria', character_class: 'Rogue', character_backstory: 'A former spy.' },
  { character_name: 'Brom', character_class: 'Fighter', character_backstory: null },
]

describe('buildGMSystemPrompt', () => {
  it('includes world content', () => {
    const prompt = buildGMSystemPrompt(world.world_content, players)
    expect(prompt).toContain('A dying empire of iron and ash')
  })

  it('includes each player with class and backstory', () => {
    const prompt = buildGMSystemPrompt(world.world_content, players)
    expect(prompt).toContain('Aria (Rogue): A former spy.')
    expect(prompt).toContain('Brom (Fighter)')
  })

  it('includes player placement rule', () => {
    const prompt = buildGMSystemPrompt(world.world_content, players)
    expect(prompt).toContain('Player placement')
  })

  it('includes story hooks rule', () => {
    const prompt = buildGMSystemPrompt(world.world_content, players)
    expect(prompt).toContain('Story hooks')
  })

  it('includes pacing rule', () => {
    const prompt = buildGMSystemPrompt(world.world_content, players)
    expect(prompt).toContain('Pacing')
  })

  it('includes first response schema in output-format', () => {
    const prompt = buildGMSystemPrompt(world.world_content, players)
    expect(prompt).toContain('world_context')
    expect(prompt).toContain('opening_situation')
    expect(prompt).toContain('starting_hooks')
  })
})

describe('buildFirstCallInput', () => {
  it('instructs the GM to generate world depth and opening scene', () => {
    const input = buildFirstCallInput()
    expect(input).toContain('History')
    expect(input).toContain('Factions')
    expect(input).toContain('Tone')
    expect(input).toContain('opening')
  })
})

describe('isFirstCallResponse', () => {
  it('returns true when world_context is present', () => {
    const response = {
      world_context: { history: '...', factions: '...', tone: '...' },
      opening_situation: '...',
      starting_hooks: ['hook 1'],
      actions: [],
      narration: ['The story begins.'],
    }
    expect(isFirstCallResponse(response)).toBe(true)
  })

  it('returns false when world_context is absent', () => {
    const response = {
      actions: [{ clientId: 'x', playerName: 'Aria', content: 'I look around.' }],
      narration: ['You see a room.'],
    }
    expect(isFirstCallResponse(response)).toBe(false)
  })
})
