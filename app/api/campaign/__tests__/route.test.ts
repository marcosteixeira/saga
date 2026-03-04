import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockInsert = vi.fn()
const mockSelect = vi.fn()
const mockSingle = vi.fn()
const mockGetUser = vi.fn()
const mockWorldSelect = vi.fn()
const mockWorldSingle = vi.fn()
const mockWorldEq1 = vi.fn()
const mockWorldEq2 = vi.fn()
const mockPlayersInsert = vi.fn().mockResolvedValue({ error: null })

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'worlds') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: mockWorldSingle,
              }),
            }),
          }),
        }
      }
      if (table === 'players') {
        return { insert: mockPlayersInsert }
      }
      // campaigns table
      return {
        insert: mockInsert.mockReturnValue({
          select: mockSelect.mockReturnValue({
            single: mockSingle,
          }),
        }),
      }
    },
  })),
  createAuthServerClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
}))

describe('POST /api/campaign', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    // By default, world exists and belongs to user
    mockWorldSingle.mockResolvedValue({ data: { id: 'world-123', status: 'ready' }, error: null })
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.GENERATE_WORLD_WEBHOOK_SECRET
  })

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', world_id: 'world-123' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when name is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.com' } } })
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ world_id: 'world-123' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when world_id is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.com' } } })
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 201 with campaign id and uses provided host_username', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'gm@saga.com' } },
    })
    mockSingle.mockResolvedValue({ data: { id: 'campaign-123' }, error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Campaign',
        host_username: 'DungeonMaster42',
        world_id: 'world-123',
      }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.id).toBe('campaign-123')
  })

  it('falls back to email as host_username when not provided', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'gm@saga.com' } },
    })
    mockSingle.mockResolvedValue({ data: { id: 'campaign-456' }, error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', world_id: 'world-123' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ host_username: 'gm@saga.com' })
    )
  })

  it('inserts campaign with status lobby', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'gm@saga.com' } },
    })
    mockSingle.mockResolvedValue({ data: { id: 'campaign-123' }, error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', world_id: 'world-123' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'lobby' })
    )
  })

  it('does not fire edge function on campaign creation', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'gm@saga.com' } },
    })
    mockSingle.mockResolvedValue({ data: { id: 'campaign-123' }, error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', world_id: 'world-123' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    expect(mockFetch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('creates a host player row after campaign is created', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'gm@saga.com' } },
    })
    mockSingle.mockResolvedValue({ data: { id: 'campaign-123' }, error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', host_username: 'GM', world_id: 'world-123' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    expect(mockPlayersInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        campaign_id: 'campaign-123',
        user_id: 'user-1',
        username: 'GM',
        is_host: true,
      })
    )
  })

  it('returns 500 when DB insert fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'gm@saga.com' } },
    })
    mockSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', world_id: 'world-123' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})
