import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockInsert = vi.fn()
const mockSelect = vi.fn()
const mockSingle = vi.fn()
const mockGetUser = vi.fn()
const mockFetch = vi.fn()

vi.stubGlobal('fetch', mockFetch)

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: () => ({
      insert: mockInsert.mockReturnValue({
        select: mockSelect.mockReturnValue({
          single: mockSingle,
        }),
      }),
    }),
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
    mockFetch.mockResolvedValue({ ok: true })
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
      body: JSON.stringify({ name: 'Test', world_description: 'World' }),
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
      body: JSON.stringify({ world_description: 'test' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when world_description is missing', async () => {
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
        world_description: 'A dark world...',
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
      body: JSON.stringify({ name: 'Test', world_description: 'World' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ host_username: 'gm@saga.com' })
    )
  })

  it('inserts campaign with status generating', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'gm@saga.com' } },
    })
    mockSingle.mockResolvedValue({ data: { id: 'campaign-123' }, error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', world_description: 'A dark world' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'generating' })
    )
  })

  it('fires edge function after campaign creation without waiting', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.GENERATE_WORLD_WEBHOOK_SECRET = 'secret-token'
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'gm@saga.com' } },
    })
    mockSingle.mockResolvedValue({ data: { id: 'campaign-999' }, error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', world_description: 'A dark world' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)

    // Response returns 201 and fetch was called with correct args
    expect(res.status).toBe(201)

    // Edge function is called (fire-and-forget)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/generate-world',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer secret-token',
        }),
        body: expect.stringContaining('campaign-999'),
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
      body: JSON.stringify({ name: 'Test', world_description: 'World' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })

  it('does not fire edge function when DB insert fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'gm@saga.com' } },
    })
    mockSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', world_description: 'World' }),
      headers: { 'Content-Type': 'application/json' },
    })
    await POST(req)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
