import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from '../route'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
  createAuthServerClient: vi.fn(),
}))

import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'

const mockUser = { id: 'user-123' }

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/campaign/abc/ready', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

const playerWithCharacter = {
  id: 'player-1',
  user_id: 'user-123',
  campaign_id: 'abc',
  character_name: 'Arwen',
  character_class: 'Mage',
  character_backstory: null,
  is_ready: false,
}

const playerWithoutCharacter = {
  id: 'player-1',
  user_id: 'user-123',
  campaign_id: 'abc',
  character_name: null,
  character_class: null,
  character_backstory: null,
  is_ready: false,
}

describe('PATCH /api/campaign/[id]/ready', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 on invalid JSON body', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const req = new Request('http://localhost/api/campaign/abc/ready', {
      method: 'PATCH',
      body: 'not-valid-json',
    })
    const res = await PATCH(req, makeParams('abc'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Invalid JSON')
  })

  it('returns 401 when not authenticated', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    })
    const res = await PATCH(makeRequest({ is_ready: true }), makeParams('abc'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when is_ready is missing', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const res = await PATCH(makeRequest({}), makeParams('abc'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('is_ready')
  })

  it('returns 400 when is_ready is a string', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const res = await PATCH(makeRequest({ is_ready: 'true' }), makeParams('abc'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('is_ready')
  })

  it('returns 400 when is_ready is a number', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const res = await PATCH(makeRequest({ is_ready: 1 }), makeParams('abc'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('is_ready')
  })

  it('returns 404 when player not found (PGRST116)', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'not found' } }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await PATCH(makeRequest({ is_ready: true }), makeParams('abc'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toContain('Player not found')
  })

  it('returns 500 on unexpected DB error during fetch', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'CONNECTION_ERROR', message: 'db exploded' } }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await PATCH(makeRequest({ is_ready: true }), makeParams('abc'))
    expect(res.status).toBe(500)
  })

  it('returns 500 when update fails', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    let callCount = 0
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.resolve({ data: playerWithCharacter, error: null })
        return Promise.resolve({ data: null, error: { code: 'WRITE_ERROR', message: 'update failed' } })
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await PATCH(makeRequest({ is_ready: true }), makeParams('abc'))
    expect(res.status).toBe(500)
  })

  it('returns 422 when marking ready=true but character_name is null', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: playerWithoutCharacter, error: null }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await PATCH(makeRequest({ is_ready: true }), makeParams('abc'))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('Character must be saved')
  })

  it('returns 200 when marking ready=true with a character saved', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const updatedPlayer = { ...playerWithCharacter, is_ready: true }
    let callCount = 0
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.resolve({ data: playerWithCharacter, error: null })
        return Promise.resolve({ data: updatedPlayer, error: null })
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await PATCH(makeRequest({ is_ready: true }), makeParams('abc'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.player.is_ready).toBe(true)
  })

  it('returns 200 when marking ready=false (no character required)', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const updatedPlayer = { ...playerWithoutCharacter, is_ready: false }
    let callCount = 0
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.resolve({ data: playerWithoutCharacter, error: null })
        return Promise.resolve({ data: updatedPlayer, error: null })
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await PATCH(makeRequest({ is_ready: false }), makeParams('abc'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.player.is_ready).toBe(false)
  })

  it('verifies the update sets is_ready correctly', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const updatedPlayer = { ...playerWithCharacter, is_ready: true }
    const updateFn = vi.fn().mockReturnThis()
    let callCount = 0
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      update: updateFn,
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return Promise.resolve({ data: playerWithCharacter, error: null })
        return Promise.resolve({ data: updatedPlayer, error: null })
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    await PATCH(makeRequest({ is_ready: true }), makeParams('abc'))
    expect(updateFn).toHaveBeenCalledWith({ is_ready: true })
  })
})
