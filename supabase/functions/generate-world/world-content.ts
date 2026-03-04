export const REQUIRED_WORLD_SECTIONS = [
  '## World Name',
  '## Overview',
  '## History',
  '## Geography',
  '## Factions',
  '## Tone',
  '## Current Situation',
  '## Starting Hooks',
] as const

export function getMissingRequiredSections(content: string): string[] {
  return REQUIRED_WORLD_SECTIONS.filter((section) => !content.includes(section))
}

export function hasAllRequiredSections(content: string): boolean {
  return getMissingRequiredSections(content).length === 0
}

