// app/api/game-session/[id]/action/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockCampaignSelect = vi.fn()
const mockPlayerSelect = vi.fn()
const mockMessageInsert = vi.fn()
const mockCampaignUpdate = vi.fn()
const mockBroadcastGameEvent = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createAuthServerClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mockGetUser } })
  ),
  createServerSupabaseClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'campaigns') {
        return {
          select: vi.fn(() => ({ eq: mockCampaignSelect })),
          update: vi.fn(() => ({ eq: mockCampaignUpdate })),
        }
      }
      if (table === 'players') {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: mockPlayerSelect })) })) })) }
      }
      if (table === 'messages') {
        return { insert: mockMessageInsert }
      }
      return {}
    },
  })),
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server')
  return { ...actual, after: vi.fn() }
})

vi.mock('@/lib/realtime-broadcast', () => ({
  broadcastGameEvent: mockBroadcastGameEvent,
}))

describe('POST /api/game-session/[id]/action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBroadcastGameEvent.mockResolvedValue(undefined)
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const { POST } = await import('../route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ id: 'msg-1', content: 'I attack' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'campaign-1' }) })

    expect(res.status).toBe(401)
  })

  it('returns 409 when round_in_progress', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCampaignSelect.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: 'campaign-1', round_in_progress: true },
        error: null,
      }),
    })
    mockPlayerSelect.mockResolvedValue({ data: { id: 'player-1' }, error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ id: 'msg-1', content: 'I attack' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'campaign-1' }) })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.reason).toBe('round_in_progress')
  })

  it('saves action and updates next_round_at when round is not in progress', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCampaignSelect.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: 'campaign-1', round_in_progress: false },
        error: null,
      }),
    })
    mockPlayerSelect.mockResolvedValue({ data: { id: 'player-1' }, error: null })
    mockMessageInsert.mockResolvedValue({ error: null })
    mockCampaignUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

    const { POST } = await import('../route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ id: 'msg-1', content: 'I attack' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'campaign-1' }) })

    expect(res.status).toBe(201)
    expect(mockMessageInsert).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'I attack', type: 'action', processed: false })
    )
    expect(mockBroadcastGameEvent).toHaveBeenCalledWith(
      'campaign-1',
      'action',
      expect.objectContaining({ content: 'I attack' })
    )
  })

  it('returns 403 when user is not a player in campaign', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCampaignSelect.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: 'campaign-1', round_in_progress: false },
        error: null,
      }),
    })
    mockPlayerSelect.mockResolvedValue({ data: null, error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ id: 'msg-1', content: 'I attack' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'campaign-1' }) })

    expect(res.status).toBe(403)
  })
})
