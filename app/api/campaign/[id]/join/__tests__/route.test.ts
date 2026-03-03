import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../route'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createAuthServerClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser }
  })),
  createServerSupabaseClient: vi.fn(() => ({ from: mockFrom }))
}))

function makeRequest(campaignId: string, body = {}) {
  return new NextRequest(`http://localhost/api/campaign/${campaignId}/join`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('POST /api/campaign/[id]/join', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest('camp-1'), { params: Promise.resolve({ id: 'camp-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', user_metadata: { display_name: 'Alice' } } } })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        })
      })
    })
    const res = await POST(makeRequest('camp-1'), { params: Promise.resolve({ id: 'camp-1' }) })
    expect(res.status).toBe(404)
  })

  it('returns 400 when campaign is not in lobby status', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', user_metadata: { display_name: 'Alice' } } } })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'camp-1', status: 'active', host_user_id: 'host-1' }, error: null })
        })
      })
    })
    const res = await POST(makeRequest('camp-1'), { params: Promise.resolve({ id: 'camp-1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 409 when user already joined', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', user_metadata: { display_name: 'Alice' } } } })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'camp-1', status: 'lobby', host_user_id: 'host-1' }, error: null })
        })
      })
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'player-1' }, error: null })
          })
        })
      })
    })
    const res = await POST(makeRequest('camp-1'), { params: Promise.resolve({ id: 'camp-1' }) })
    expect(res.status).toBe(409)
  })

  it('returns 409 when campaign is full', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-new', user_metadata: { display_name: 'Bob' } } } })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'camp-1', status: 'lobby', host_user_id: 'host-1' }, error: null })
        })
      })
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        })
      })
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: Array(6).fill({}), error: null })
      })
    })
    const res = await POST(makeRequest('camp-1'), { params: Promise.resolve({ id: 'camp-1' }) })
    expect(res.status).toBe(409)
  })

  it('returns 201 with player data on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'alice@test.com', user_metadata: { display_name: 'Alice' } } } })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'camp-1', status: 'lobby', host_user_id: 'host-1' }, error: null })
        })
      })
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        })
      })
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null })
      })
    })
    const mockInsertedPlayer = { id: 'player-new', user_id: 'user-1', username: 'Alice', is_host: false }
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockInsertedPlayer, error: null })
        })
      })
    })
    const res = await POST(makeRequest('camp-1', { character_name: 'Gandalf', character_class: 'Wizard' }), { params: Promise.resolve({ id: 'camp-1' }) })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.player.user_id).toBe('user-1')
  })

  it('uses display_name from user metadata as username', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'alice@test.com', user_metadata: { display_name: 'Alice Wonder' } } } })
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'p1', username: 'Alice Wonder' }, error: null })
      })
    })
    mockFrom
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'camp-1', status: 'lobby', host_user_id: 'host-1' }, error: null }) }) }) })
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) })
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) })
      .mockReturnValueOnce({ insert: mockInsert })
    await POST(makeRequest('camp-1'), { params: Promise.resolve({ id: 'camp-1' }) })
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'Alice Wonder' })
    )
  })
})
