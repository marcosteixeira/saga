import { describe, it, expect } from 'vitest'
import { REQUIRED_WORLD_SECTIONS, getMissingRequiredSections, hasAllRequiredSections } from '../world-content'

const VALID_WORLD_MD = `
## World Name
Ironhold

## Overview
A dying empire...

## History
Once great...

## Geography
Mountains and fog...

## Factions
The Guild controls...

## Tone
Dark, industrial, hopeless.
`

describe('REQUIRED_WORLD_SECTIONS', () => {
  it('contains exactly 6 sections', () => {
    expect(REQUIRED_WORLD_SECTIONS).toHaveLength(6)
  })

  it('does not include Current Situation', () => {
    expect(REQUIRED_WORLD_SECTIONS).not.toContain('## Current Situation')
  })

  it('does not include Starting Hooks', () => {
    expect(REQUIRED_WORLD_SECTIONS).not.toContain('## Starting Hooks')
  })
})

describe('hasAllRequiredSections', () => {
  it('returns true when all 6 sections are present', () => {
    expect(hasAllRequiredSections(VALID_WORLD_MD)).toBe(true)
  })

  it('returns false when a required section is missing', () => {
    const incomplete = VALID_WORLD_MD.replace('## Factions', '')
    expect(hasAllRequiredSections(incomplete)).toBe(false)
  })
})

describe('getMissingRequiredSections', () => {
  it('returns empty array when all sections present', () => {
    expect(getMissingRequiredSections(VALID_WORLD_MD)).toEqual([])
  })

  it('returns missing section names', () => {
    const incomplete = VALID_WORLD_MD.replace('## Tone', '')
    expect(getMissingRequiredSections(incomplete)).toEqual(['## Tone'])
  })
})
