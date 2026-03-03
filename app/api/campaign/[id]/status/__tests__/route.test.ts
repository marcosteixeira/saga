import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PATCH } from '../route'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createAuthServerClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mockGetUser } })
  ),
  createServerSupabaseClient: vi.fn(() => ({ from: mockFrom })),
}))

function makeRequest(campaignId: string, body = {}) {
  return new NextRequest(`http://localhost/api/campaign/${campaignId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('PATCH /api/campaign/[id]/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makeRequest('c1', { status: 'ended' }), {
      params: Promise.resolve({ id: 'c1' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 403 when not the host', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'other' } } })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'c1', status: 'paused', host_user_id: 'host-1' },
            error: null,
          }),
        }),
      }),
    })
    const res = await PATCH(makeRequest('c1', { status: 'ended' }), {
      params: Promise.resolve({ id: 'c1' }),
    })
    expect(res.status).toBe(403)
  })

  it('returns 400 for invalid status transition (active → ended)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'c1', status: 'active', host_user_id: 'host-1' },
            error: null,
          }),
        }),
      }),
    })
    const res = await PATCH(makeRequest('c1', { status: 'ended' }), {
      params: Promise.resolve({ id: 'c1' }),
    })
    expect(res.status).toBe(400)
  })

  it('updates status on valid paused → ended transition', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    let selectCalled = false
    mockFrom.mockImplementation(() => {
      if (!selectCalled) {
        selectCalled = true
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'c1', status: 'paused', host_user_id: 'host-1' },
                error: null,
              }),
            }),
          }),
        }
      }
      return { update: mockUpdate }
    })
    const res = await PATCH(makeRequest('c1', { status: 'ended' }), {
      params: Promise.resolve({ id: 'c1' }),
    })
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'ended' })
  })
})
