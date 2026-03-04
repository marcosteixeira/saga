import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetUser = vi.fn()
const mockHostCampaignsEq = vi.fn()
const mockHostCampaignsSelect = vi.fn(() => ({ eq: mockHostCampaignsEq }))
const mockPlayersEq = vi.fn()
const mockPlayersSelect = vi.fn(() => ({ eq: mockPlayersEq }))
const mockJoinedCampaignsIn = vi.fn()
const mockJoinedCampaignsSelect = vi.fn(() => ({ in: mockJoinedCampaignsIn }))
let campaignsSelectCallCount = 0

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
          select: () => {
            campaignsSelectCallCount += 1
            if (campaignsSelectCallCount === 1) return mockHostCampaignsSelect()
            return mockJoinedCampaignsSelect()
          },
        }
      }

      if (table === 'players') {
        return {
          select: mockPlayersSelect,
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  })),
}))

describe('GET /api/profile/campaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    campaignsSelectCallCount = 0
  })

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const { GET } = await import('../route')
    const res = await GET()

    expect(res.status).toBe(401)
  })

  it('returns merged host and joined campaigns', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    mockHostCampaignsEq.mockResolvedValue({
      data: [
        { id: 'c1', name: 'Host Camp', status: 'generating', host_user_id: 'user-1', created_at: '2026-03-04T10:00:00Z' },
      ],
      error: null,
    })

    mockPlayersEq.mockResolvedValue({
      data: [
        { campaign_id: 'c2' },
      ],
      error: null,
    })

    mockJoinedCampaignsIn.mockResolvedValue({
      data: [
        { id: 'c2', name: 'Player Camp', status: 'active', host_user_id: 'user-2', created_at: '2026-03-03T10:00:00Z' },
      ],
      error: null,
    })

    const { GET } = await import('../route')
    const res = await GET()

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.campaigns).toHaveLength(2)
    expect(data.campaigns[0]).toMatchObject({ id: 'c1', is_host: true })
    expect(data.campaigns[1]).toMatchObject({ id: 'c2', is_host: false })
  })
})
