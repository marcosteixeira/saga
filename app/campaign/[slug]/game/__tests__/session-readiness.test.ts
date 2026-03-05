import { describe, expect, it, vi } from 'vitest'
import {
  fetchSessionOpeningReady,
  waitForSessionOpeningReady,
} from '@/app/campaign/[slug]/game/session-readiness'

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

  it('returns false when query throws', async () => {
    const fetchSession = vi.fn().mockRejectedValue(new Error('network down'))

    const ready = await fetchSessionOpeningReady(fetchSession)

    expect(ready).toBe(false)
  })
})

describe('waitForSessionOpeningReady', () => {
  it('retries until session opening_situation becomes available', async () => {
    const fetchSession = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'temporary failure' } })
      .mockResolvedValueOnce({ data: { opening_situation: null }, error: null })
      .mockResolvedValueOnce({ data: { opening_situation: 'Ready now' }, error: null })
    const sleep = vi.fn().mockResolvedValue(undefined)

    const ready = await waitForSessionOpeningReady(fetchSession, {
      maxAttempts: 5,
      sleep,
    })

    expect(ready).toBe(true)
    expect(fetchSession).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('stops after max attempts when readiness never arrives', async () => {
    const fetchSession = vi
      .fn()
      .mockResolvedValue({ data: { opening_situation: null }, error: null })
    const sleep = vi.fn().mockResolvedValue(undefined)

    const ready = await waitForSessionOpeningReady(fetchSession, {
      maxAttempts: 3,
      sleep,
    })

    expect(ready).toBe(false)
    expect(fetchSession).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })
})
