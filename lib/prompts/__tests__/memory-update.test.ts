import { describe, it, expect } from 'vitest'
import { extractMemoryUpdate } from '../memory-update'

describe('extractMemoryUpdate', () => {
  it('extracts JSON MEMORY_UPDATE block from narration', () => {
    const text = `The party enters the tavern.\n\nMEMORY_UPDATE\n\`\`\`json\n{"events":["Entered tavern"],"memory_md":"Party is in the tavern."}\n\`\`\``
    const result = extractMemoryUpdate(text)
    expect(result.narration.trim()).toBe('The party enters the tavern.')
    expect(result.memoryUpdate?.events).toEqual(['Entered tavern'])
    expect(result.memoryUpdate?.memory_md).toBe('Party is in the tavern.')
  })

  it('extracts raw JSON block without code fences', () => {
    const text = `Narration text.\n\nMEMORY_UPDATE\n{"events":["Something happened"]}`
    const result = extractMemoryUpdate(text)
    expect(result.narration.trim()).toBe('Narration text.')
    expect(result.memoryUpdate?.events).toEqual(['Something happened'])
  })

  it('extracts GENERATE_IMAGE directive', () => {
    const text = `The dragon appears!\n\nGENERATE_IMAGE: A massive red dragon breathing fire in a dark cavern`
    const result = extractMemoryUpdate(text)
    expect(result.narration.trim()).toBe('The dragon appears!')
    expect(result.generateImage).toBe('A massive red dragon breathing fire in a dark cavern')
  })

  it('handles narration with both MEMORY_UPDATE and GENERATE_IMAGE', () => {
    const text = `Battle begins!\n\nMEMORY_UPDATE\n{"events":["Combat started"]}\n\nGENERATE_IMAGE: Warriors facing a horde of goblins`
    const result = extractMemoryUpdate(text)
    expect(result.narration.trim()).toBe('Battle begins!')
    expect(result.memoryUpdate?.events).toEqual(['Combat started'])
    expect(result.generateImage).toBe('Warriors facing a horde of goblins')
  })

  it('returns null memoryUpdate when no block found', () => {
    const text = 'Just plain narration with no special blocks.'
    const result = extractMemoryUpdate(text)
    expect(result.narration).toBe(text)
    expect(result.memoryUpdate).toBeNull()
    expect(result.generateImage).toBeNull()
  })

  it('handles malformed JSON gracefully', () => {
    const text = `Narration.\n\nMEMORY_UPDATE\n{invalid json here}`
    const result = extractMemoryUpdate(text)
    expect(result.narration.trim()).toBe('Narration.')
    expect(result.memoryUpdate).toBeNull()
  })

  it('extracts character_updates with HP changes', () => {
    const text = `The goblin strikes Gandalf!\n\nMEMORY_UPDATE\n{"character_updates":[{"name":"Gandalf","hp":15,"note":"Took 5 damage from goblin"}]}`
    const result = extractMemoryUpdate(text)
    expect(result.memoryUpdate?.character_updates?.[0]).toEqual({
      name: 'Gandalf', hp: 15, note: 'Took 5 damage from goblin'
    })
  })
})
