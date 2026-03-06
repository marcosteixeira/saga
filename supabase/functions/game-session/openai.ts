import { isFirstCallResponse } from './prompt.ts'

export function extractNarration(response: unknown): string[] {
  if (typeof response !== 'object' || response === null) return []
  const r = response as Record<string, unknown>
  if (!Array.isArray(r.narration)) return []
  return r.narration as string[]
}
