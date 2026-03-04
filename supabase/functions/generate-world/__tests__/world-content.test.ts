import { describe, expect, it } from 'vitest'
import { getMissingRequiredSections, hasAllRequiredSections } from '../world-content'

describe('world content section validation', () => {
  it('reports missing required sections for incomplete WORLD.md', () => {
    const content = `## World Name\n\n## Overview\n\n## History\n\n## Geography`

    expect(getMissingRequiredSections(content)).toEqual([
      '## Factions',
      '## Tone',
      '## Current Situation',
      '## Starting Hooks',
    ])
    expect(hasAllRequiredSections(content)).toBe(false)
  })

  it('passes when all required sections are present', () => {
    const content = [
      '## World Name',
      '## Overview',
      '## History',
      '## Geography',
      '## Factions',
      '## Tone',
      '## Current Situation',
      '## Starting Hooks',
    ].join('\n\n')

    expect(getMissingRequiredSections(content)).toEqual([])
    expect(hasAllRequiredSections(content)).toBe(true)
  })
})
