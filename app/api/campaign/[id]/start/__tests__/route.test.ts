import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
  createAuthServerClient: vi.fn(),
}))

vi.mock('@/lib/realtime-broadcast', () => ({
  broadcastCampaignEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/anthropic', () => ({
  anthropic: { messages: { create: vi.fn() } },
}))

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

  it('returns 200, updates campaign to active, and broadcasts game:starting when all ready', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockHostUser } }) },
    })
    const campaign = { id: 'abc', host_user_id: 'host-user-id', status: 'lobby', world_id: 'world-1' }
    const players = [
      { id: 'p1', is_ready: true, character_name: 'Arwen', character_class: 'Mage', character_backstory: null, username: 'alice' },
    ]
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq })
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
    const res = await POST(makeRequest(), makeParams('abc'))
    expect(res.status).toBe(200)
    expect(updateFn).toHaveBeenCalledWith({ status: 'active' })
    expect(broadcastCampaignEvent).toHaveBeenCalledWith('abc', 'game:starting', {})
  })
})
