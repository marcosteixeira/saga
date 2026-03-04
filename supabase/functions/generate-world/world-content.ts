export const REQUIRED_WORLD_SECTIONS = [
  '## World Name',
  '## Overview',
  '## History',
  '## Geography',
  '## Factions',
  '## Tone',
] as const

export function getMissingRequiredSections(content: string): string[] {
  return REQUIRED_WORLD_SECTIONS.filter((section) => !content.includes(section))
}

export function hasAllRequiredSections(content: string): boolean {
  return getMissingRequiredSections(content).length === 0
}

export type WorldClass = {
  name: string;
  description: string;
};

/**
 * Extracts the JSON classes array from the ## Classes code block.
 * Returns [] if the section is missing or the JSON is invalid.
 */
export function parseClassesFromContent(content: string): WorldClass[] {
  const match = content.match(/## Classes\s*```json\s*([\s\S]*?)```/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[1].trim())
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

/**
 * Removes the ## Classes section (heading + code block) from the content.
 * Returns original content if no Classes section found.
 */
export function stripClassesFromContent(content: string): string {
  return content.replace(/\n?## Classes\s*```json\s*[\s\S]*?```\s*/g, '')
}

/**
 * Returns true if classes is an array of exactly 6 objects with name + description strings.
 */
export function validateClasses(classes: unknown[]): boolean {
  if (!Array.isArray(classes) || classes.length !== 6) return false
  return classes.every(
    (c) =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as Record<string, unknown>).name === 'string' &&
      typeof (c as Record<string, unknown>).description === 'string'
  )
}
