import { describe, expect, it, vi } from 'vitest'
import { fetchSessionOpeningReady } from '@/app/campaign/[slug]/game/session-readiness'

describe('fetchSessionOpeningReady', () => {
  it('returns true when session opening_situation exists', async () => {
    const fetchSession = vi.fn().mockResolvedValue({
      data: { opening_situation: 'You arrive at dawn.' },
      error: null,
    })

    const ready = await fetchSessionOpeningReady(fetchSession)

    expect(ready).toBe(true)
    expect(fetchSession).toHaveBeenCalledTimes(1)
  })

  it('returns false when query errors', async () => {
    const fetchSession = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    })

    const ready = await fetchSessionOpeningReady(fetchSession)

    expect(ready).toBe(false)
  })
})
