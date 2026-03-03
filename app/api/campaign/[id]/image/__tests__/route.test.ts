import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const mockUpdate = vi.fn().mockResolvedValue({ error: null })
const mockEqUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))

const mockSingle = vi.fn()
const mockEqSingle = vi.fn(() => ({ single: mockSingle }))

const mockFrom = vi.fn((table: string) => {
  if (table === 'campaigns') {
    return { select: vi.fn(() => ({ eq: mockEqSingle })), update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) }
  }
  if (table === 'players') {
    return { update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) }
  }
  return {}
})

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({ from: mockFrom }))
}))

vi.mock('@/lib/image-gen', () => ({
  generateAndStoreImage: vi.fn().mockResolvedValue('https://storage.example.com/image.png')
}))

describe('POST /api/campaign/[id]/image', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: campaign found
    mockSingle.mockResolvedValue({ data: { id: 'camp-1', name: 'Test Campaign' }, error: null })
  })

  it('returns 404 when campaign does not exist', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign/camp-1/image', {
      method: 'POST',
      body: JSON.stringify({ type: 'cover', prompt: 'A dark castle' })
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'camp-1' }) })
    expect(res.status).toBe(404)
  })

  it('returns 400 when type is missing', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign/camp-1/image', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'A dark castle' })
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'camp-1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when prompt is missing', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign/camp-1/image', {
      method: 'POST',
      body: JSON.stringify({ type: 'cover' })
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'camp-1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 200 with URL on successful cover generation', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign/camp-1/image', {
      method: 'POST',
      body: JSON.stringify({ type: 'cover', prompt: 'A dark castle' })
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'camp-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBe('https://storage.example.com/image.png')
  })

  it('updates campaign cover_image_url for cover type', async () => {
    const mockCampaignUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))
    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaigns') {
        return {
          select: vi.fn(() => ({ eq: mockEqSingle })),
          update: mockCampaignUpdate
        }
      }
      return {}
    })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign/camp-1/image', {
      method: 'POST',
      body: JSON.stringify({ type: 'cover', prompt: 'A dark castle' })
    })
    await POST(req, { params: Promise.resolve({ id: 'camp-1' }) })
    expect(mockCampaignUpdate).toHaveBeenCalledWith({ cover_image_url: 'https://storage.example.com/image.png' })
  })

  it('updates campaign map_image_url for map type', async () => {
    const mockCampaignUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }))
    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaigns') {
        return {
          select: vi.fn(() => ({ eq: mockEqSingle })),
          update: mockCampaignUpdate
        }
      }
      return {}
    })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign/camp-1/image', {
      method: 'POST',
      body: JSON.stringify({ type: 'map', prompt: 'A world map' })
    })
    await POST(req, { params: Promise.resolve({ id: 'camp-1' }) })
    expect(mockCampaignUpdate).toHaveBeenCalledWith({ map_image_url: 'https://storage.example.com/image.png' })
  })
})
