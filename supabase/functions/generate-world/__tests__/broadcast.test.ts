import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn()

import { broadcastToChannel } from '../broadcast'

describe('broadcastToChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockResolvedValue({ ok: true, status: 200 })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('POSTs to the Supabase Realtime broadcast endpoint', async () => {
    await broadcastToChannel(
      'https://abc.supabase.co',
      'service-role-key',
      'campaign-123',
      'world:complete',
      { status: 'lobby' },
    )

    expect(mockFetch).toHaveBeenCalledWith(
      'https://abc.supabase.co/realtime/v1/api/broadcast',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })

  it('sends the correct channel topic, event, and payload', async () => {
    await broadcastToChannel(
      'https://abc.supabase.co',
      'service-role-key',
      'campaign-123',
      'world:error',
      { status: 'error' },
    )

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)

    expect(body).toEqual({
      messages: [
        {
          topic: 'campaign-123',
          event: 'world:error',
          payload: { status: 'error' },
        },
      ],
    })
  })

  it('includes the required headers', async () => {
    await broadcastToChannel(
      'https://abc.supabase.co',
      'my-service-role-key',
      'campaign-456',
      'world:complete',
      {},
    )

    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers['apikey']).toBe('my-service-role-key')
    expect(options.headers['Authorization']).toBe('Bearer my-service-role-key')
    expect(options.headers['Content-Type']).toBe('application/json')
  })

  it('does not throw and logs when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('network error'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(
      broadcastToChannel('https://abc.supabase.co', 'key', 'campaign-1', 'world:complete', {})
    ).resolves.toBeUndefined()

    expect(consoleSpy).toHaveBeenCalled()
  })

  it('logs when the HTTP response is not ok', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await broadcastToChannel('https://abc.supabase.co', 'key', 'campaign-1', 'world:complete', {})

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('HTTP 500'),
    )
  })
})
