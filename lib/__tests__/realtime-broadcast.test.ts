import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Must import AFTER stubbing fetch
const { broadcastPlayerUpdate, broadcastPlayerJoin } = await import('../realtime-broadcast')

const fakePlayer = {
  id: 'player-1',
  campaign_id: 'camp-1',
  user_id: 'user-1',
  username: 'testuser',
  character_name: 'Aldric',
  character_class: 'Warrior',
  character_backstory: null,
  is_ready: false,
  is_host: false,
  character_image_url: null,
  stats: { hp: 20, hp_max: 20 },
  status: 'active' as const,
  absence_mode: 'skip' as const,
  last_seen_at: '2026-01-01T00:00:00Z',
  joined_at: '2026-01-01T00:00:00Z',
}

describe('broadcastPlayerUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true, status: 200 })
    vi.stubEnv('SUPABASE_URL', 'https://abc.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('POSTs to the Supabase Realtime broadcast endpoint', async () => {
    await broadcastPlayerUpdate('camp-1', fakePlayer)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://abc.supabase.co/realtime/v1/api/broadcast',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sends correct channel topic, event, and full player payload', async () => {
    await broadcastPlayerUpdate('camp-1', fakePlayer)
    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body).toEqual({
      messages: [
        {
          topic: 'campaign:camp-1',
          event: 'player:updated',
          payload: fakePlayer,
        },
      ],
    })
  })

  it('includes apikey, Authorization, and Content-Type headers', async () => {
    await broadcastPlayerUpdate('camp-1', fakePlayer)
    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers['apikey']).toBe('service-role-key')
    expect(options.headers['Authorization']).toBe('Bearer service-role-key')
    expect(options.headers['Content-Type']).toBe('application/json')
  })

  it('does not throw when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('network error'))
    await expect(broadcastPlayerUpdate('camp-1', fakePlayer)).resolves.toBeUndefined()
  })

  it('resolves without throwing when fetch returns non-ok status (fire-and-forget)', async () => {
    // fetch() resolves normally on HTTP errors — only throws on network failure.
    // This test confirms the function completes cleanly regardless of HTTP status.
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' })
    await expect(broadcastPlayerUpdate('camp-1', fakePlayer)).resolves.toBeUndefined()
    // The fetch was still called (broadcast was attempted)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

describe('broadcastPlayerJoin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true, status: 200 })
    vi.stubEnv('SUPABASE_URL', 'https://abc.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('POSTs to the Supabase Realtime broadcast endpoint', async () => {
    await broadcastPlayerJoin('camp-1', fakePlayer)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://abc.supabase.co/realtime/v1/api/broadcast',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sends player:joined event on the correct channel', async () => {
    await broadcastPlayerJoin('camp-1', fakePlayer)
    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body).toEqual({
      messages: [
        {
          topic: 'campaign:camp-1',
          event: 'player:joined',
          payload: fakePlayer,
        },
      ],
    })
  })

  it('does not throw when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('network error'))
    await expect(broadcastPlayerJoin('camp-1', fakePlayer)).resolves.toBeUndefined()
  })
})
