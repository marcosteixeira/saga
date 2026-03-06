import { describe, it, expect } from 'vitest'
import { REQUIRED_WORLD_SECTIONS, getMissingRequiredSections, hasAllRequiredSections, parseClassesFromContent, stripClassesFromContent, validateClasses } from '../world-content'

const VALID_CLASSES_JSON = JSON.stringify([
  { name: "Shadow Warden", description: "Protectors of the veil." },
  { name: "Ashen Knight", description: "Warriors of cursed flame." },
  { name: "Veil Dancer", description: "Illusionists of the mist." },
  { name: "Iron Cleric", description: "Faith hammered into steel." },
  { name: "Hollow Scout", description: "Rangers who feel no fear." },
  { name: "Dusk Mage", description: "Scholars of dying light." },
])

const VALID_WORLD_MD = `
## World Name
Ironhold

## Overview
A dying empire...

## Geography
Mountains and fog...

## Classes
\`\`\`json
${VALID_CLASSES_JSON}
\`\`\`
`

describe('REQUIRED_WORLD_SECTIONS', () => {
  it('contains exactly 4 sections', () => {
    expect(REQUIRED_WORLD_SECTIONS).toHaveLength(4)
  })

  it('does not include History', () => {
    expect(REQUIRED_WORLD_SECTIONS).not.toContain('## History')
  })

  it('does not include Factions', () => {
    expect(REQUIRED_WORLD_SECTIONS).not.toContain('## Factions')
  })

  it('does not include Tone', () => {
    expect(REQUIRED_WORLD_SECTIONS).not.toContain('## Tone')
  })
})

describe('hasAllRequiredSections', () => {
  it('returns true when all 4 sections are present', () => {
    expect(hasAllRequiredSections(VALID_WORLD_MD)).toBe(true)
  })

  it('returns false when a required section is missing', () => {
    const incomplete = VALID_WORLD_MD.replace('## Geography', '')
    expect(hasAllRequiredSections(incomplete)).toBe(false)
  })
})

describe('getMissingRequiredSections', () => {
  it('returns empty array when all sections present', () => {
    expect(getMissingRequiredSections(VALID_WORLD_MD)).toEqual([])
  })

  it('returns missing section names', () => {
    const incomplete = VALID_WORLD_MD.replace('## Geography', '')
    expect(getMissingRequiredSections(incomplete)).toEqual(['## Geography'])
  })
})

const VALID_WORLD_MD_NO_CLASSES = `
## World Name
Ironhold

## Overview
A dying empire...

## Geography
Mountains and fog...
`

// --- parseClassesFromContent ---

const VALID_CONTENT_WITH_CLASSES = `
## World Name
Ironhold

## Overview
A dying empire...

## Geography
Mountains and fog...

## Classes
\`\`\`json
${VALID_CLASSES_JSON}
\`\`\`
`

describe('parseClassesFromContent', () => {
  it('extracts the classes array from valid content', () => {
    const result = parseClassesFromContent(VALID_CONTENT_WITH_CLASSES)
    expect(result).toHaveLength(6)
    expect(result[0]).toEqual({ name: "Shadow Warden", description: "Protectors of the veil." })
  })

  it('returns empty array when ## Classes section is missing', () => {
    expect(parseClassesFromContent(VALID_WORLD_MD_NO_CLASSES)).toEqual([])
  })

  it('returns empty array when JSON block is malformed', () => {
    const bad = VALID_CONTENT_WITH_CLASSES.replace(VALID_CLASSES_JSON, 'not-json')
    expect(parseClassesFromContent(bad)).toEqual([])
  })
})

describe('stripClassesFromContent', () => {
  it('removes the ## Classes section and returns clean markdown', () => {
    const stripped = stripClassesFromContent(VALID_CONTENT_WITH_CLASSES)
    expect(stripped).not.toContain('## Classes')
    expect(stripped).not.toContain('```json')
    expect(stripped).toContain('## Geography')
  })

  it('returns original content unchanged when no ## Classes section exists', () => {
    const result = stripClassesFromContent(VALID_WORLD_MD_NO_CLASSES)
    expect(result).toBe(VALID_WORLD_MD_NO_CLASSES)
  })
})

describe('validateClasses', () => {
  it('returns true for exactly 6 valid class objects', () => {
    const classes = JSON.parse(VALID_CLASSES_JSON)
    expect(validateClasses(classes)).toBe(true)
  })

  it('returns false when fewer than 6 classes', () => {
    expect(validateClasses([{ name: "A", description: "B" }])).toBe(false)
  })

  it('returns false when a class is missing name', () => {
    const bad = [
      { description: "No name" },
      ...JSON.parse(VALID_CLASSES_JSON).slice(1),
    ]
    expect(validateClasses(bad)).toBe(false)
  })

  it('returns false when a class is missing description', () => {
    const bad = [
      { name: "No desc" },
      ...JSON.parse(VALID_CLASSES_JSON).slice(1),
    ]
    expect(validateClasses(bad)).toBe(false)
  })
})
