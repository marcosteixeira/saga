import { describe, it, expect } from 'vitest'
import { buildWorldGenPrompt } from '../world-gen'

describe('buildWorldGenPrompt', () => {
  it('includes the user description in the prompt', () => {
    const result = buildWorldGenPrompt('A dark medieval kingdom')
    expect(result).toContain('A dark medieval kingdom')
  })

  it('requests Markdown output with required sections', () => {
    const result = buildWorldGenPrompt('Any world')
    expect(result).toContain('World Name')
    expect(result).toContain('Overview')
    expect(result).toContain('History')
    expect(result).toContain('Geography')
    expect(result).toContain('Factions')
    expect(result).toContain('Starting Hooks')
  })
})
