import { describe, expect, it } from 'vitest'
import { formatMessageTimeUtc } from '@/app/campaign/[slug]/game/components/message-time'

describe('formatMessageTimeUtc', () => {
  it('returns deterministic HH:MM in UTC', () => {
    expect(formatMessageTimeUtc('2026-03-05T09:07:00.000Z')).toBe('09:07')
    expect(formatMessageTimeUtc('2026-03-05T23:59:00.000Z')).toBe('23:59')
  })

  it('returns fallback for invalid dates', () => {
    expect(formatMessageTimeUtc('not-a-date')).toBe('--:--')
  })
})
