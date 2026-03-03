import { describe, it, expect } from 'vitest'
import { buildGMSystemPrompt } from '../gm-system'

describe('buildGMSystemPrompt', () => {
  it('includes all provided memory files in the prompt', () => {
    const result = buildGMSystemPrompt({
      worldMd: '# Dark Realm',
      charactersMd: '# Characters',
      npcsMd: '# NPCs',
      locationsMd: '# Locations',
      memoryMd: '# Memory',
    })
    expect(result).toContain('# Dark Realm')
    expect(result).toContain('# Characters')
    expect(result).toContain('<world>')
    expect(result).toContain('<player-characters>')
    expect(result).toContain('<known-npcs>')
    expect(result).toContain('<campaign-summary>')
  })

  it('includes system_description when provided', () => {
    const result = buildGMSystemPrompt({
      worldMd: '', charactersMd: '', npcsMd: '',
      locationsMd: '', memoryMd: '',
      systemDescription: 'No magic allowed'
    })
    expect(result).toContain('No magic allowed')
  })

  it('omits system_description section when not provided', () => {
    const result = buildGMSystemPrompt({
      worldMd: '', charactersMd: '', npcsMd: '',
      locationsMd: '', memoryMd: '',
    })
    expect(result).not.toContain('undefined')
  })

  it('includes narration, mechanics, and memory rules', () => {
    const result = buildGMSystemPrompt({
      worldMd: '', charactersMd: '', npcsMd: '',
      locationsMd: '', memoryMd: '',
    })
    expect(result).toContain('narration-rules')
    expect(result).toContain('mechanics-rules')
    expect(result).toContain('memory-rules')
    expect(result).toContain('MEMORY_UPDATE')
    expect(result).toContain('GENERATE_IMAGE')
  })
})
