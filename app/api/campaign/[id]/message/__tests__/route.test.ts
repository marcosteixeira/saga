import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../route'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()
const mockChannel = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createAuthServerClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
  createServerSupabaseClient: vi.fn(() => ({
    from: mockFrom,
    channel: mockChannel,
  })),
}))

function makeRequest(campaignId: string, body = {}) {
  return new NextRequest(`http://localhost/api/campaign/${campaignId}/message`, {
    method: 'POST',
    body: JSON.stringify({ content: 'I attack!', type: 'action', ...body }),
    headers: { 'Content-Type': 'application/json' },
  })
}

// Helper to build a chainable Supabase query mock that resolves at the end
function makeQuery(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  const terminal = vi.fn().mockResolvedValue(result)
  // single() or resolves directly
  chain.single = terminal
  // For array results (no .single())
  chain.then = (fn: (v: typeof result) => unknown) => Promise.resolve(result).then(fn)
  // eq, order, limit all return chain
  const wrap = () => chain
  chain.eq = vi.fn(wrap)
  chain.order = vi.fn(wrap)
  chain.limit = vi.fn(wrap)
  chain.gt = vi.fn().mockResolvedValue(result)
  chain.insert = vi.fn(wrap)
  chain.select = vi.fn(wrap)
  return chain
}

describe('POST /api/campaign/[id]/message', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
        }),
      }),
    })
    const res = await POST(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(404)
  })

  it('returns 400 when campaign is not active', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'lobby', current_session_id: 's1' }, error: null }),
        }),
      }),
    })
    const res = await POST(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 403 when player not in campaign', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'active', current_session_id: 's1' }, error: null }),
        }),
      }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
          }),
        }),
      }),
    })
    const res = await POST(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(403)
  })

  it('returns 400 when player is dead', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'active', current_session_id: 's1' }, error: null }),
        }),
      }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'p1', status: 'dead' }, error: null }),
          }),
        }),
      }),
    })
    const res = await POST(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when content is empty', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'active', current_session_id: 's1' }, error: null }),
        }),
      }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'p1', status: 'active' }, error: null }),
          }),
        }),
      }),
    })
    const res = await POST(makeRequest('c1', { content: '' }), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 409 when player already submitted this turn', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    // campaign
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'active', current_session_id: 's1' }, error: null }),
        }),
      }),
    })
    // player
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'p1', status: 'active' }, error: null }),
          }),
        }),
      }),
    })
    // last narration — none
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    })
    // existing action since last narration
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockResolvedValue({ data: [{ id: 'msg-existing' }], error: null }),
              }),
            }),
          }),
        }),
      }),
    })
    const res = await POST(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(409)
  })

  it('returns 201 and saves message on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    // campaign
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'c1', status: 'active', current_session_id: 's1' }, error: null }),
        }),
      }),
    })
    // player
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'p1', status: 'active' }, error: null }),
          }),
        }),
      }),
    })
    // last narration — none
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    })
    // no existing action
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    })
    // insert message
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'msg-1', content: 'I attack!', type: 'action' }, error: null }),
        }),
      }),
    })
    mockChannel.mockReturnValue({ send: vi.fn().mockResolvedValue('ok') })

    const res = await POST(makeRequest('c1'), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(201)
  })
})
