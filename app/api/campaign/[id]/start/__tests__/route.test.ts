import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
  createAuthServerClient: vi.fn(),
}))

vi.mock('@/lib/realtime-broadcast', () => ({
  broadcastCampaignEvent: vi.fn().mockResolvedValue(undefined),
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'
import { broadcastCampaignEvent } from '@/lib/realtime-broadcast'
import { POST } from '../route'

const mockHostUser = { id: 'host-user-id' }

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeRequest() {
  return new Request('http://localhost/api/campaign/abc/start', { method: 'POST' })
}

describe('POST /api/campaign/[id]/start', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    })
    const res = await POST(makeRequest(), makeParams('abc'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign not found', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockHostUser } }) },
    })
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await POST(makeRequest(), makeParams('abc'))
    expect(res.status).toBe(404)
  })

  it('returns 403 when user is not the host', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'not-the-host' } } }) },
    })
    const campaign = { id: 'abc', host_user_id: 'host-user-id', status: 'lobby' }
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: campaign, error: null }),
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await POST(makeRequest(), makeParams('abc'))
    expect(res.status).toBe(403)
  })

  it('returns 409 when campaign is already active', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockHostUser } }) },
    })
    const campaign = { id: 'abc', host_user_id: 'host-user-id', status: 'active' }
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: campaign, error: null }),
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await POST(makeRequest(), makeParams('abc'))
    expect(res.status).toBe(409)
  })

  it('returns 400 when not all players are ready', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockHostUser } }) },
    })
    const campaign = { id: 'abc', host_user_id: 'host-user-id', status: 'lobby' }
    const players = [
      { id: 'p1', is_ready: true },
      { id: 'p2', is_ready: false },
    ]
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'campaigns') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: campaign, error: null }),
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: players, error: null }),
        }
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await POST(makeRequest(), makeParams('abc'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/not ready/i)
  })

  it('returns 200, updates campaign to active, broadcasts game:starting, and calls edge function when all ready', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockHostUser } }) },
    })
    const campaign = { id: 'abc', host_user_id: 'host-user-id', status: 'lobby', world_id: 'world-1' }
    const players = [
      { id: 'p1', is_ready: true, character_name: 'Arwen', character_class: 'Mage', character_backstory: null, username: 'alice' },
    ]
    const updateQuery = {
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'abc' }, error: null }),
    }
    const updateFn = vi.fn().mockReturnValue(updateQuery)
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'campaigns') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: campaign, error: null }),
          update: updateFn,
        }
        if (table === 'players') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: players, error: null }),
        }
        return {}
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    fetchMock.mockResolvedValue({ ok: true })

    const res = await POST(makeRequest(), makeParams('abc'))
    expect(res.status).toBe(200)
    expect(updateFn).toHaveBeenCalledWith({ status: 'active' })
    expect(updateQuery.eq).toHaveBeenNthCalledWith(1, 'id', 'abc')
    expect(updateQuery.eq).toHaveBeenNthCalledWith(2, 'status', 'lobby')
    expect(broadcastCampaignEvent).toHaveBeenCalledWith('abc', 'game:starting', {})
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/functions/v1/generate-image'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ entity_type: 'campaign', entity_id: 'abc', image_type: 'cover' }),
      })
    )
    // must NOT call the deleted start-campaign function
    const startCampaignCall = fetchMock.mock.calls.find(([url]: [string]) => String(url).includes('start-campaign'))
    expect(startCampaignCall).toBeUndefined()
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })

  it('returns 409 when atomic lobby->active update affects no rows', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockHostUser } }) },
    })
    const campaign = { id: 'abc', host_user_id: 'host-user-id', status: 'lobby' }
    const players = [{ id: 'p1', is_ready: true }]

    const updateQuery = {
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    }
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'campaigns') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: campaign, error: null }),
          update: vi.fn().mockReturnValue(updateQuery),
        }
        if (table === 'players') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: players, error: null }),
        }
        return {}
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)

    const res = await POST(makeRequest(), makeParams('abc'))
    expect(res.status).toBe(409)
    expect(updateQuery.eq).toHaveBeenNthCalledWith(1, 'id', 'abc')
    expect(updateQuery.eq).toHaveBeenNthCalledWith(2, 'status', 'lobby')
    expect(broadcastCampaignEvent).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
