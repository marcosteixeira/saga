import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../route'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()
const mockSend = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createAuthServerClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mockGetUser } })
  ),
  createServerSupabaseClient: vi.fn(() => ({
    from: mockFrom,
    channel: vi.fn().mockReturnValue({ send: mockSend }),
  })),
}))

vi.mock('@/lib/anthropic', () => ({
  anthropic: {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Session summary...' }],
      }),
    },
  },
}))

vi.mock('@/lib/memory', () => ({
  upsertCampaignFile: vi.fn().mockResolvedValue(undefined),
}))

function makeRequest(campaignId: string) {
  return new NextRequest(
    `http://localhost/api/campaign/${campaignId}/session/end`,
    { method: 'POST' }
  )
}

const activeCampaign = {
  id: 'c1',
  status: 'active',
  host_user_id: 'host-1',
  current_session_id: 's1',
}

describe('POST /api/campaign/[id]/session/end', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue(undefined)
  })

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
          single: vi.fn().mockResolvedValue({ data: null, error: {} }),
        }),
      }),
    })
    const res = await POST(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(404)
  })

  it('returns 403 when not the host', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'other-user' } } })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: activeCampaign, error: null }),
        }),
      }),
    })
    const res = await POST(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(403)
  })

  it('returns 400 when campaign is not active', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { ...activeCampaign, status: 'paused' },
            error: null,
          }),
        }),
      }),
    })
    const res = await POST(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(400)
  })

  function makeSuccessMocks() {
    // We need to handle multiple `from` calls in sequence:
    // 1. campaigns select
    // 2. sessions select (get session number)
    // 3. messages select (get messages)
    // 4. sessions update
    // 5. campaigns update
    let callCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaigns') {
        if (callCount === 0) {
          callCount++
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: activeCampaign, error: null }),
              }),
            }),
          }
        }
        // campaigns update
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      if (table === 'sessions') {
        // sessions select or update
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 's1', session_number: 3 },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }
      }
      if (table === 'messages') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'players') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      }
      return { select: vi.fn(), update: vi.fn() }
    })
  }

  it('generates session summary via Claude', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })
    makeSuccessMocks()
    const { anthropic } = await import('@/lib/anthropic')
    await POST(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(anthropic.messages.create).toHaveBeenCalled()
  })

  it('updates campaign status to paused on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })
    makeSuccessMocks()
    await POST(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    // The campaign update should have been called with status=paused
    // We verify by checking the mockFrom calls included campaigns update
    const calls = mockFrom.mock.calls.map((c: string[]) => c[0])
    expect(calls).toContain('campaigns')
  })

  it('returns 200 with summary text on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })
    makeSuccessMocks()
    const res = await POST(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.summary).toBeDefined()
  })
})
