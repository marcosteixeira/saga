// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVoiceNarration } from '../useVoiceNarration'

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock Audio
class MockAudio {
  src = ''
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
}
vi.stubGlobal('Audio', MockAudio)

// Mock URL.createObjectURL / revokeObjectURL
vi.stubGlobal('URL', {
  createObjectURL: vi.fn().mockReturnValue('blob:fake-url'),
  revokeObjectURL: vi.fn()
})

const mockAudioBlob = new Blob(['fake audio'], { type: 'audio/mpeg' })

describe('useVoiceNarration', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    mockFetch.mockResolvedValue(new Response(mockAudioBlob))
  })

  it('starts enabled by default', () => {
    const { result } = renderHook(() => useVoiceNarration())
    expect(result.current.enabled).toBe(true)
  })

  it('persists disabled state to localStorage', () => {
    const { result } = renderHook(() => useVoiceNarration())
    act(() => result.current.toggle())
    expect(result.current.enabled).toBe(false)
    expect(localStorage.getItem('saga:voice-narration')).toBe('false')
  })

  it('reads enabled state from localStorage on mount', () => {
    localStorage.setItem('saga:voice-narration', 'false')
    const { result } = renderHook(() => useVoiceNarration())
    expect(result.current.enabled).toBe(false)
  })

  it('speak() posts to /api/tts and sets isPlaying', async () => {
    const { result } = renderHook(() => useVoiceNarration())
    await act(async () => {
      await result.current.speak('Hello adventurer')
    })
    expect(mockFetch).toHaveBeenCalledWith('/api/tts', expect.objectContaining({
      method: 'POST'
    }))
    expect(result.current.isPlaying).toBe(true)
  })

  it('speak() is a no-op when disabled', async () => {
    localStorage.setItem('saga:voice-narration', 'false')
    const { result } = renderHook(() => useVoiceNarration())
    await act(async () => {
      await result.current.speak('Hello')
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('replay() re-speaks last text', async () => {
    const { result } = renderHook(() => useVoiceNarration())
    await act(async () => { await result.current.speak('First narration') })
    mockFetch.mockClear()
    await act(async () => { await result.current.replay() })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('replay() is a no-op if no lastText', async () => {
    const { result } = renderHook(() => useVoiceNarration())
    await act(async () => { await result.current.replay() })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('stop() pauses and clears isPlaying', async () => {
    const { result } = renderHook(() => useVoiceNarration())
    await act(async () => { await result.current.speak('Hello') })
    act(() => result.current.stop())
    expect(result.current.isPlaying).toBe(false)
  })

  it('toggle() stops playback when disabling', async () => {
    const { result } = renderHook(() => useVoiceNarration())
    await act(async () => { await result.current.speak('Hello') })
    act(() => result.current.toggle())
    expect(result.current.enabled).toBe(false)
    expect(result.current.isPlaying).toBe(false)
  })
})
