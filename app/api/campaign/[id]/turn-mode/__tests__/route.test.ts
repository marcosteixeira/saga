import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

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
  return new NextRequest(`http://localhost/api/campaign/${campaignId}/turn-mode`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

// Build a chainable Supabase mock
function makeQuery(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  chain.single = vi.fn().mockResolvedValue(result)
  chain.then = (fn: (v: typeof result) => unknown) => Promise.resolve(result).then(fn)
  const wrap = () => chain
  chain.eq = vi.fn(wrap)
  chain.order = vi.fn(wrap)
  chain.limit = vi.fn(wrap)
  chain.in = vi.fn(wrap)
  chain.select = vi.fn(wrap)
  chain.update = vi.fn(wrap)
  return chain
}

function makeChannelMock() {
  return {
    send: vi.fn().mockResolvedValue({}),
  }
}

describe('PATCH /api/campaign/[id]/turn-mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { PATCH } = await import('../route')
    const res = await PATCH(makeRequest('c1', { mode: 'sequential' }), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 403 when not the host', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-2' } } })

    const campaignQuery = makeQuery({ data: { id: 'c1', host_user_id: 'user-1', turn_mode: 'free', turn_state: {} }, error: null })
    mockFrom.mockReturnValue(campaignQuery)

    const { PATCH } = await import('../route')
    const res = await PATCH(makeRequest('c1', { mode: 'sequential' }), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(403)
  })

  it('switches to sequential mode with turn order', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })

    const channelMock = makeChannelMock()
    mockChannel.mockReturnValue(channelMock)

    const updateChain = makeQuery({ data: { id: 'c1' }, error: null })
    const campaignChain = makeQuery({ data: { id: 'c1', host_user_id: 'host-1', turn_mode: 'free', turn_state: {} }, error: null })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaigns') return campaignChain
      return makeQuery({ data: [], error: null })
    })
    ;(campaignChain.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain)

    const { PATCH } = await import('../route')
    const res = await PATCH(
      makeRequest('c1', { mode: 'sequential', turn_order: ['p1', 'p2', 'p3'] }),
      { params: Promise.resolve({ id: 'c1' }) }
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.turn_state.order).toEqual(['p1', 'p2', 'p3'])
    expect(data.turn_state.current_index).toBe(0)
    expect(data.turn_state.round).toBe(1)
    expect(data.turn_mode).toBe('sequential')
  })

  it('defaults turn order to active players by join date', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })

    const channelMock = makeChannelMock()
    mockChannel.mockReturnValue(channelMock)

    const players = [
      { id: 'p1', joined_at: '2024-01-01T10:00:00Z' },
      { id: 'p2', joined_at: '2024-01-01T09:00:00Z' },
      { id: 'p3', joined_at: '2024-01-01T11:00:00Z' },
    ]

    const updateChain = makeQuery({ data: { id: 'c1' }, error: null })
    const campaignChain = makeQuery({ data: { id: 'c1', host_user_id: 'host-1', turn_mode: 'free', turn_state: {} }, error: null })
    const playersChain = makeQuery({ data: players, error: null })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaigns') return campaignChain
      if (table === 'players') return playersChain
      return makeQuery({ data: [], error: null })
    })
    ;(campaignChain.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain)

    const { PATCH } = await import('../route')
    const res = await PATCH(
      makeRequest('c1', { mode: 'sequential' }),
      { params: Promise.resolve({ id: 'c1' }) }
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    // sorted by joined_at: p2, p1, p3
    expect(data.turn_state.order).toEqual(['p2', 'p1', 'p3'])
  })

  it('switches back to free mode and clears turn state', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })

    const channelMock = makeChannelMock()
    mockChannel.mockReturnValue(channelMock)

    const updateChain = makeQuery({ data: { id: 'c1' }, error: null })
    const campaignChain = makeQuery({
      data: { id: 'c1', host_user_id: 'host-1', turn_mode: 'sequential', turn_state: { order: ['p1'], current_index: 0, round: 2 } },
      error: null,
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaigns') return campaignChain
      return makeQuery({ data: [], error: null })
    })
    ;(campaignChain.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain)

    const { PATCH } = await import('../route')
    const res = await PATCH(makeRequest('c1', { mode: 'free' }), { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.turn_mode).toBe('free')
    expect(data.turn_state).toEqual({})
  })

  it('broadcasts mode change to all clients', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })

    const channelMock = makeChannelMock()
    mockChannel.mockReturnValue(channelMock)

    const updateChain = makeQuery({ data: { id: 'c1' }, error: null })
    const campaignChain = makeQuery({ data: { id: 'c1', host_user_id: 'host-1', turn_mode: 'free', turn_state: {} }, error: null })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaigns') return campaignChain
      return makeQuery({ data: [], error: null })
    })
    ;(campaignChain.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain)

    const { PATCH } = await import('../route')
    await PATCH(
      makeRequest('c1', { mode: 'sequential', turn_order: ['p1', 'p2'] }),
      { params: Promise.resolve({ id: 'c1' }) }
    )

    expect(mockChannel).toHaveBeenCalledWith('campaign:c1:turn')
    expect(channelMock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'broadcast',
        event: 'turn_mode_changed',
      })
    )
  })
})
