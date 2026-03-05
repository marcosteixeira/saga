import { describe, expect, it } from 'vitest'
import { formatMessageTimeLocal } from '@/app/campaign/[slug]/game/components/message-time'

describe('formatMessageTimeLocal', () => {
  it('formats local time using en-GB 24-hour clock', () => {
    expect(formatMessageTimeLocal('2026-03-05T09:07:00.000Z', 'UTC')).toBe('09:07')
    expect(formatMessageTimeLocal('2026-03-05T09:07:00.000Z', 'Africa/Maputo')).toBe('11:07')
  })

  it('returns fallback for invalid dates', () => {
    expect(formatMessageTimeLocal('not-a-date')).toBe('--:--')
  })
})
