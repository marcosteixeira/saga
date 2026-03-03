import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCampaignSingle = vi.fn()
const mockPlayerSelect = vi.fn()
const mockFileSelect = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'campaigns') {
        return {
          select: () => ({
            eq: () => ({
              single: mockCampaignSingle,
            }),
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
    },
  })),
}))

describe('GET /api/campaign/[id]', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 404 when campaign does not exist', async () => {
    mockCampaignSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
    mockPlayerSelect.mockReturnValue({ eq: () => ({ data: [], error: null }) })
    mockFileSelect.mockReturnValue({ eq: () => ({ data: [], error: null }) })

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/campaign/nonexistent')
    const res = await GET(req, { params: Promise.resolve({ id: 'nonexistent' }) })
    expect(res.status).toBe(404)
  })

  it('returns campaign with players and files on success', async () => {
    const campaign = { id: 'campaign-123', name: 'Test', status: 'lobby' }
    const players = [{ id: 'p1', name: 'Hero' }]
    const files = [{ id: 'f1', file_type: 'world' }]

    mockCampaignSingle.mockResolvedValue({ data: campaign, error: null })
    mockPlayerSelect.mockReturnValue({ eq: () => ({ data: players, error: null }) })
    mockFileSelect.mockReturnValue({ eq: () => ({ data: files, error: null }) })

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/campaign/campaign-123')
    const res = await GET(req, { params: Promise.resolve({ id: 'campaign-123' }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.campaign).toEqual(campaign)
    expect(data.players).toEqual(players)
    expect(data.files).toEqual(files)
  })
})
