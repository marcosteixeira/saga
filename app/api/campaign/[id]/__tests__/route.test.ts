import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockCampaignEq = vi.fn()
const mockCampaignSingle = vi.fn()
const mockMembershipEqUser = vi.fn()
const mockMembershipMaybeSingle = vi.fn()
const mockPlayerSelect = vi.fn()
const mockFileSelect = vi.fn()
const mockImagesSelect = vi.fn()

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
      if (table === 'players') {
        return {
          select: mockPlayerSelect,
        }
      }
      if (table === 'campaign_files') {
        return {
          select: mockFileSelect,
        }
      }
      if (table === 'images') {
        return {
          select: mockImagesSelect,
        }
      }
      return undefined
    },
  })),
}))

describe('GET /api/campaign/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockCampaignEq.mockReturnValue({ single: mockCampaignSingle })
    mockMembershipEqUser.mockReturnValue({ maybeSingle: mockMembershipMaybeSingle })

    mockPlayerSelect.mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) })
    mockFileSelect.mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) })
    mockImagesSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })
  })

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/campaign/nonexistent')
    const res = await GET(req, { params: Promise.resolve({ id: 'nonexistent' }) })

    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign does not exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCampaignSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/campaign/nonexistent')
    const res = await GET(req, { params: Promise.resolve({ id: 'nonexistent' }) })

    expect(res.status).toBe(404)
  })

  it('returns 403 when user is not host and not a player', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCampaignSingle.mockResolvedValue({
      data: { id: 'campaign-123', host_user_id: 'host-1', worlds: null },
      error: null,
    })

    const eqCampaignId = vi.fn().mockReturnValue({ eq: mockMembershipEqUser })
    mockPlayerSelect.mockReturnValue({ eq: eqCampaignId })
    mockMembershipMaybeSingle.mockResolvedValue({ data: null, error: null })

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/campaign/campaign-123')
    const res = await GET(req, { params: Promise.resolve({ id: 'campaign-123' }) })

    expect(res.status).toBe(403)
  })

  it('returns 500 when loading players fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })

    const campaign = { id: 'campaign-123', host_user_id: 'host-1', name: 'Test', status: 'lobby', worlds: null }
    mockCampaignSingle.mockResolvedValue({ data: campaign, error: null })

    mockPlayerSelect.mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }) })

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/campaign/campaign-123')
    const res = await GET(req, { params: Promise.resolve({ id: 'campaign-123' }) })

    expect(res.status).toBe(500)
  })

  it('returns campaign with players and files on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'host-1' } } })

    const campaign = { id: 'campaign-123', host_user_id: 'host-1', name: 'Test', status: 'lobby', worlds: { id: 'w1' } }
    const players = [{ id: 'p1', name: 'Hero' }]
    const files = [{ id: 'f1', file_type: 'world' }]
    const images = [
      { entity_type: 'world', entity_id: 'w1', image_type: 'cover', public_url: 'https://img/world-cover.png' },
      { entity_type: 'campaign', entity_id: 'campaign-123', image_type: 'cover', public_url: 'https://img/campaign-cover.png' },
    ]

    mockCampaignSingle.mockResolvedValue({ data: campaign, error: null })
    mockPlayerSelect.mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: players, error: null }) })
    mockFileSelect.mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: files, error: null }) })
    mockImagesSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          not: vi.fn().mockResolvedValue({ data: images, error: null }),
        }),
      }),
    })

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/campaign/campaign-123')
    const res = await GET(req, { params: Promise.resolve({ id: 'campaign-123' }) })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.campaign).toEqual(expect.objectContaining({ id: campaign.id, name: campaign.name }))
    expect(data.players).toEqual(players)
    expect(data.files).toEqual(files)
    expect(data.world_cover_url).toBe('https://img/world-cover.png')
    expect(data.campaign_cover_url).toBe('https://img/campaign-cover.png')
  })
})
