// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTurnTimer } from '../turn-timer'

describe('useTurnTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts down from timerSeconds', () => {
    const onExpire = vi.fn()
    const { result } = renderHook(() => useTurnTimer(10, onExpire))

    expect(result.current.timeRemaining).toBe(10)
    expect(result.current.isActive).toBe(true)

    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current.timeRemaining).toBe(7)

    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current.timeRemaining).toBe(2)
  })

  it('calls onExpire when timer reaches 0', () => {
    const onExpire = vi.fn()
    renderHook(() => useTurnTimer(5, onExpire))

    act(() => { vi.advanceTimersByTime(5000) })
    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it('reset restarts the countdown', () => {
    const onExpire = vi.fn()
    const { result } = renderHook(() => useTurnTimer(10, onExpire))

    act(() => { vi.advanceTimersByTime(6000) })
    expect(result.current.timeRemaining).toBe(4)

    act(() => { result.current.reset() })
    expect(result.current.timeRemaining).toBe(10)

    act(() => { vi.advanceTimersByTime(3000) })
    expect(result.current.timeRemaining).toBe(7)
    expect(onExpire).not.toHaveBeenCalled()
  })
})
