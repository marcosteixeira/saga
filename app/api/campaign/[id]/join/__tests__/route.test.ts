import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '../route'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
  createAuthServerClient: vi.fn(),
}))

import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'

const mockUser = { id: 'user-123', user_metadata: { display_name: 'testuser' } }

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('POST /api/campaign/[id]/join', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    })
    const req = new Request('http://localhost/api/campaign/abc/join', {
      method: 'POST',
      body: JSON.stringify({ username: 'testuser' }),
    })
    const res = await POST(req, makeParams('abc'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when username is missing', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const req = new Request('http://localhost/api/campaign/abc/join', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req, makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when campaign does not exist', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const req = new Request('http://localhost/api/campaign/abc/join', {
      method: 'POST',
      body: JSON.stringify({ username: 'testuser' }),
    })
    const res = await POST(req, makeParams('abc'))
    expect(res.status).toBe(404)
  })

  it('returns 409 when campaign is not in lobby status', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'camp-1', status: 'active' }, error: null }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const req = new Request('http://localhost/api/campaign/abc/join', {
      method: 'POST',
      body: JSON.stringify({ username: 'testuser' }),
    })
    const res = await POST(req, makeParams('abc'))
    expect(res.status).toBe(409)
  })

  it('returns 200 with existing player if already joined', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const existingPlayer = { id: 'player-1', user_id: 'user-123', campaign_id: 'camp-1', username: 'testuser' }

    const singleResponses = [
      { data: { id: 'camp-1', status: 'lobby' }, error: null },
      { data: existingPlayer, error: null },
    ]
    let callCount = 0
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(() => Promise.resolve(singleResponses[callCount++])),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const req = new Request('http://localhost/api/campaign/camp-1/join', {
      method: 'POST',
      body: JSON.stringify({ username: 'testuser' }),
    })
    const res = await POST(req, makeParams('camp-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.player.id).toBe('player-1')
  })

  it('creates a new player and returns 201', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const newPlayer = { id: 'player-new', user_id: 'user-123', campaign_id: 'camp-1', username: 'testuser' }

    let callCount = 0
    const singleResponses = [
      { data: { id: 'camp-1', status: 'lobby' }, error: null },
      { data: null, error: { code: 'PGRST116' } },
    ]
    const mockInsert = {
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: newPlayer, error: null }),
    }
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(() => {
        const r = singleResponses[callCount++]
        return Promise.resolve(r)
      }),
      insert: vi.fn().mockReturnValue(mockInsert),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const req = new Request('http://localhost/api/campaign/camp-1/join', {
      method: 'POST',
      body: JSON.stringify({ username: 'testuser' }),
    })
    const res = await POST(req, makeParams('camp-1'))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.player.id).toBe('player-new')
  })
})
