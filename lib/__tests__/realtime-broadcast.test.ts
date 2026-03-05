import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
})

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

describe('broadcastCampaignEvent', () => {
  it('POSTs to the Supabase realtime broadcast endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    const { broadcastCampaignEvent } = await import('../realtime-broadcast')
    await broadcastCampaignEvent('campaign-1', 'game:starting', {})
    expect(fetchMock).toHaveBeenCalledWith(
      'https://test.supabase.co/realtime/v1/api/broadcast',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'test-service-role-key',
          Authorization: 'Bearer test-service-role-key',
        }),
      })
    )
  })

  it('sends the correct channel and event in the body', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    const { broadcastCampaignEvent } = await import('../realtime-broadcast')
    await broadcastCampaignEvent('campaign-42', 'game:started', { session_id: 'sess-1' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.messages[0].topic).toBe('campaign:campaign-42')
    expect(body.messages[0].event).toBe('game:started')
    expect(body.messages[0].payload).toEqual({ session_id: 'sess-1' })
  })

  it('swallows errors silently', async () => {
    fetchMock.mockRejectedValue(new Error('network error'))
    const { broadcastCampaignEvent } = await import('../realtime-broadcast')
    await expect(broadcastCampaignEvent('campaign-1', 'game:starting', {})).resolves.toBeUndefined()
  })
})
