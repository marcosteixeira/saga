import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { broadcastCampaignEvent, broadcastPlayerUpdate, broadcastPlayerJoin } = await import('../realtime-broadcast')

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

beforeEach(() => {
  vi.clearAllMocks()
  mockFetch.mockResolvedValue({ ok: true, status: 200 })
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('broadcastCampaignEvent', () => {
  it('sends event to the campaign topic', async () => {
    await broadcastCampaignEvent('camp-1', 'game:starting', { ok: true })
    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)

    expect(mockFetch).toHaveBeenCalledWith(
      'https://abc.supabase.co/realtime/v1/api/broadcast',
      expect.objectContaining({ method: 'POST' })
    )
    expect(body).toEqual({
      messages: [
        {
          topic: 'campaign:camp-1',
          event: 'game:starting',
          payload: { ok: true },
        },
      ],
    })
  })
})

describe('broadcastPlayerUpdate', () => {
  it('sends player:updated on campaign topic', async () => {
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

  it('includes required headers', async () => {
    await broadcastPlayerUpdate('camp-1', fakePlayer)
    const [, options] = mockFetch.mock.calls[0]

    expect(options.headers.apikey).toBe('service-role-key')
    expect(options.headers.Authorization).toBe('Bearer service-role-key')
    expect(options.headers['Content-Type']).toBe('application/json')
  })

  it('does not throw on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('network error'))
    await expect(broadcastPlayerUpdate('camp-1', fakePlayer)).resolves.toBeUndefined()
  })
})

describe('broadcastPlayerJoin', () => {
  it('sends player:joined on campaign topic', async () => {
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

  it('does not throw on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('network error'))
    await expect(broadcastPlayerJoin('camp-1', fakePlayer)).resolves.toBeUndefined()
  })
})
