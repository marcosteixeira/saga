import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetUser = vi.fn()
const mockCampaignSingle = vi.fn()
const mockCampaignUpdateEq = vi.fn()
const mockCampaignUpdate = vi.fn()
const mockCampaignSelectEq = vi.fn()
const mockCampaignSelect = vi.fn()
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
      if (table !== 'campaigns') {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        select: (...args: unknown[]) => {
          mockCampaignSelect(...args)
          return { eq: mockCampaignSelectEq }
        },
        update: (...args: unknown[]) => {
          mockCampaignUpdate(...args)
          return { eq: mockCampaignUpdateEq }
        },
      }
    },
  })),
}))

describe('POST /api/campaign/[id]/regenerate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.GENERATE_WORLD_WEBHOOK_SECRET = 'secret-1'

    mockCampaignSelectEq.mockReturnValue({ single: mockCampaignSingle })
    mockCampaignUpdateEq.mockResolvedValue({ error: null })
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

  it('returns 403 when user is not the host', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCampaignSingle.mockResolvedValue({
      data: { id: 'campaign-1', host_user_id: 'user-2', world_description: 'desc' },
      error: null,
    })

    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'campaign-1' }),
    })

    expect(res.status).toBe(403)
  })

  it('returns 202 immediately and fires edge function without awaiting', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCampaignSingle.mockResolvedValue({
      data: { id: 'campaign-1', host_user_id: 'user-1', world_description: 'desc' },
      error: null,
    })

    const { POST } = await import('../route')
    const res = await POST(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'campaign-1' }),
    })

    expect(res.status).toBe(202)
    expect(mockCampaignUpdate).toHaveBeenCalledWith({ status: 'generating' })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/generate-world',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer secret-1' }),
      })
    )
  })
})
