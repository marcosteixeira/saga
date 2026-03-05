import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetUser = vi.fn()
const mockCampaignEq = vi.fn()
const mockCampaignSingle = vi.fn()
const mockWorldUpdateEq = vi.fn()
const mockWorldUpdate = vi.fn()
const mockFetch = vi.fn()

vi.stubGlobal('fetch', mockFetch)

vi.mock('@/lib/supabase/server', () => ({
  createAuthServerClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
  createServerSupabaseClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'campaigns') {
        return {
          select: () => ({
            eq: mockCampaignEq,
          }),
        }
      }

      if (table === 'worlds') {
        return {
          update: (...args: unknown[]) => {
            mockWorldUpdate(...args)
            return { eq: mockWorldUpdateEq }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  })),
}))

describe('POST /api/campaign/[id]/regenerate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.GENERATE_WORLD_WEBHOOK_SECRET = 'secret-1'

    mockCampaignEq.mockReturnValue({ single: mockCampaignSingle })
    mockWorldUpdateEq.mockResolvedValue({ error: null })
    mockFetch.mockResolvedValue({ ok: true })
  })

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'campaign-1' }),
    })

    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign is not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCampaignSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'campaign-1' }),
    })

    expect(res.status).toBe(404)
  })

  it('looks campaigns up by slug when param is not a uuid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCampaignSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const { POST } = await import('../route')
    await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'the-king-in-the-north-844f0c' }),
    })

    expect(mockCampaignEq).toHaveBeenCalledWith('slug', 'the-king-in-the-north-844f0c')
  })

  it('returns 403 when user is not the host', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCampaignSingle.mockResolvedValue({
      data: { id: 'campaign-1', host_user_id: 'user-2', world_id: 'world-1', worlds: { id: 'world-1', description: 'desc' } },
      error: null,
    })

    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'campaign-1' }),
    })

    expect(res.status).toBe(403)
  })

  it('returns 202 and fires generate-world on the world record', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCampaignSingle.mockResolvedValue({
      data: {
        id: 'campaign-1',
        host_user_id: 'user-1',
        world_id: 'world-1',
        worlds: { id: 'world-1', description: 'A dark world' },
      },
      error: null,
    })

    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'campaign-1' }),
    })

    expect(res.status).toBe(202)
    expect(mockWorldUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'generating', world_content: null })
    )
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/generate-world',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer secret-1' }),
        body: expect.stringContaining('world-1'),
      })
    )
  })
})
