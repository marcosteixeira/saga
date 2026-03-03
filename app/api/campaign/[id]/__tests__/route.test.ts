import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCampaignSingle = vi.fn()
const mockPlayerSelect = vi.fn()
const mockFileSelect = vi.fn()
const mockMessageQuery = vi.fn()

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
      if (table === 'game_events') {
        return {
          select: () => ({
            eq: mockMessageQuery,
          }),
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

  it('includes messages when include=messages param is present', async () => {
    const campaign = { id: 'campaign-123', name: 'Test', status: 'active', current_session_id: 'session-1' }
    const messages = [
      { id: 'm1', type: 'narration', content: 'You enter the dungeon', session_id: 'session-1' },
      { id: 'm2', type: 'action', content: 'I attack', session_id: 'session-1' },
    ]

    mockCampaignSingle.mockResolvedValue({ data: campaign, error: null })
    mockPlayerSelect.mockReturnValue({ eq: () => ({ data: [], error: null }) })
    mockFileSelect.mockReturnValue({ eq: () => ({ data: [], error: null }) })
    mockMessageQuery.mockReturnValue({ order: () => ({ data: messages, error: null }) })

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/campaign/campaign-123?include=messages')
    const res = await GET(req, { params: Promise.resolve({ id: 'campaign-123' }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.messages).toEqual(messages)
  })

  it('returns only current session messages', async () => {
    const campaign = { id: 'campaign-123', name: 'Test', status: 'active', current_session_id: 'session-2' }
    const messages = [{ id: 'm3', type: 'system', content: 'Session started', session_id: 'session-2' }]

    mockCampaignSingle.mockResolvedValue({ data: campaign, error: null })
    mockPlayerSelect.mockReturnValue({ eq: () => ({ data: [], error: null }) })
    mockFileSelect.mockReturnValue({ eq: () => ({ data: [], error: null }) })
    mockMessageQuery.mockReturnValue({ order: () => ({ data: messages, error: null }) })

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/campaign/campaign-123?include=messages')
    const res = await GET(req, { params: Promise.resolve({ id: 'campaign-123' }) })
    const data = await res.json()
    // Verify the mock was called with the correct session_id
    expect(mockMessageQuery).toHaveBeenCalledWith('session_id', 'session-2')
    expect(data.messages).toEqual(messages)
  })

  it('returns empty messages array when no current session', async () => {
    const campaign = { id: 'campaign-123', name: 'Test', status: 'lobby', current_session_id: null }

    mockCampaignSingle.mockResolvedValue({ data: campaign, error: null })
    mockPlayerSelect.mockReturnValue({ eq: () => ({ data: [], error: null }) })
    mockFileSelect.mockReturnValue({ eq: () => ({ data: [], error: null }) })

    const { GET } = await import('../route')
    const req = new Request('http://localhost/api/campaign/campaign-123?include=messages')
    const res = await GET(req, { params: Promise.resolve({ id: 'campaign-123' }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.messages).toEqual([])
  })
})
