import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase
const mockInsert = vi.fn()
const mockSelect = vi.fn()
const mockSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: () => ({
      insert: mockInsert.mockReturnValue({
        select: mockSelect.mockReturnValue({
          single: mockSingle
        })
      })
    })
  }))
}))

describe('POST /api/campaign', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ host_username: 'test', world_description: 'test' }),
      headers: { 'Content-Type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when host_username is missing', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'test', world_description: 'test' }),
      headers: { 'Content-Type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when world_description is missing', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({ name: 'test', host_username: 'test' }),
      headers: { 'Content-Type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 201 with campaign id on success', async () => {
    mockSingle.mockResolvedValue({
      data: { id: 'campaign-123', host_session_token: 'token-abc' },
      error: null
    })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Campaign',
        host_username: 'TestHost',
        world_description: 'A dark world...'
      }),
      headers: { 'Content-Type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.id).toBe('campaign-123')
    expect(data.host_session_token).toBe('token-abc')
  })

  it('returns 500 when DB insert fails', async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'DB error' }
    })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        host_username: 'Host',
        world_description: 'World...'
      }),
      headers: { 'Content-Type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})
