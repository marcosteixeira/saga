import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sessions, getOrCreateSession } from '../state.ts'
import { resetDebounce, cancelDebounce, DEBOUNCE_SECONDS } from '../debounce.ts'

beforeEach(() => {
  sessions.clear()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

import { afterEach } from 'vitest'

describe('resetDebounce', () => {
  it('fires after DEBOUNCE_SECONDS', () => {
    getOrCreateSession('campaign-1')
    const onFire = vi.fn()
    resetDebounce('campaign-1', onFire)
    expect(onFire).not.toHaveBeenCalled()
    vi.advanceTimersByTime(DEBOUNCE_SECONDS * 1000)
    expect(onFire).toHaveBeenCalledOnce()
  })

  it('resets timer on new message — only fires once after last reset', () => {
    getOrCreateSession('campaign-1')
    const onFire = vi.fn()
    resetDebounce('campaign-1', onFire)
    vi.advanceTimersByTime(4000)
    resetDebounce('campaign-1', onFire)  // reset at 4s
    vi.advanceTimersByTime(4000)          // now at 8s total, but only 4s since last reset
    expect(onFire).not.toHaveBeenCalled()
    vi.advanceTimersByTime(DEBOUNCE_SECONDS * 1000)
    expect(onFire).toHaveBeenCalledOnce()
  })

  it('sets debounceTimer on session', () => {
    const session = getOrCreateSession('campaign-1')
    resetDebounce('campaign-1', vi.fn())
    expect(session.debounceTimer).not.toBeNull()
  })

  it('clears debounceTimer after firing', () => {
    const session = getOrCreateSession('campaign-1')
    resetDebounce('campaign-1', vi.fn())
    vi.advanceTimersByTime(DEBOUNCE_SECONDS * 1000)
    expect(session.debounceTimer).toBeNull()
  })
})

describe('cancelDebounce', () => {
  it('prevents timer from firing', () => {
    getOrCreateSession('campaign-1')
    const onFire = vi.fn()
    resetDebounce('campaign-1', onFire)
    cancelDebounce('campaign-1')
    vi.advanceTimersByTime(DEBOUNCE_SECONDS * 1000 * 2)
    expect(onFire).not.toHaveBeenCalled()
  })

  it('sets debounceTimer to null', () => {
    const session = getOrCreateSession('campaign-1')
    resetDebounce('campaign-1', vi.fn())
    cancelDebounce('campaign-1')
    expect(session.debounceTimer).toBeNull()
  })
})
