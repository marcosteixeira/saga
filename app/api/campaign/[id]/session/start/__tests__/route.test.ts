import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../route'

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createAuthServerClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser }
  })),
  createServerSupabaseClient: vi.fn(() => ({ from: mockFrom }))
}))

function makeRequest(campaignId: string) {
  return new NextRequest(`http://localhost/api/campaign/${campaignId}/session/start`, {
    method: 'POST'
  })
}

describe('POST /api/campaign/[id]/session/start', () => {
  beforeEach(() => { vi.resetAllMocks() })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        })
      })
    })
    const res = await POST(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(404)
  })

  it('returns 403 when user is not the host', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'other-user' } } })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'lobby', host_user_id: 'host-1' }, error: null })
        })
      })
    })
    const res = await POST(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(403)
  })

  it('returns 400 when campaign is already active', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'active', host_user_id: 'host-1' }, error: null })
        })
      })
    })
    const res = await POST(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 200 and creates session on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })
    mockFrom
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'lobby', host_user_id: 'host-1' }, error: null }) }) })
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) })
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ id: 'p1' }, { id: 'p2' }], error: null }) }) })
      })
      .mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'sess-1', session_number: 1 }, error: null }) }) })
      })
      .mockReturnValueOnce({
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
      })
    const res = await POST(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.session.id).toBe('sess-1')
  })

  it('sets present_player_ids to all active player ids', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })
    const mockInsert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'sess-1', session_number: 1 }, error: null }) }) })
    mockFrom
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'lobby', host_user_id: 'host-1' }, error: null }) }) }) })
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) })
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [{ id: 'p1' }, { id: 'p2' }], error: null }) }) }) })
      .mockReturnValueOnce({ insert: mockInsert })
      .mockReturnValueOnce({ update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) })
    await POST(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ present_player_ids: ['p1', 'p2'] })
    )
  })
})
