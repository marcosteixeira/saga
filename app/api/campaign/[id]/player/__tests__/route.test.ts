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
  return new Request('http://localhost/api/campaign/abc/player', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/campaign/[id]/player', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    })
    const res = await PATCH(makeRequest({ character_name: 'Arwen', character_class: 'Mage' }), makeParams('abc'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when character_name is missing', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const res = await PATCH(makeRequest({ character_class: 'Mage' }), makeParams('abc'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('character_name')
  })

  it('returns 400 when character_name is blank whitespace', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const res = await PATCH(makeRequest({ character_name: '   ', character_class: 'Mage' }), makeParams('abc'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('character_name')
  })

  it('returns 400 when character_class is missing', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const res = await PATCH(makeRequest({ character_name: 'Arwen' }), makeParams('abc'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('character_class')
  })

  it('returns 400 when character_class is blank whitespace', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const res = await PATCH(makeRequest({ character_name: 'Arwen', character_class: '   ' }), makeParams('abc'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('character_class')
  })

  it('returns 404 when player row does not exist for this user/campaign', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'not found' } }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await PATCH(makeRequest({ character_name: 'Arwen', character_class: 'Mage' }), makeParams('abc'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toContain('Player not found')
  })

  it('returns 500 on unexpected DB error', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'SOME_DB_ERROR', message: 'connection failed' } }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const req = new Request('http://localhost/api/campaign/camp-1/player', {
      method: 'PATCH',
      body: JSON.stringify({ character_name: 'Aldric', character_class: 'Warrior' }),
    })
    const res = await PATCH(req, makeParams('camp-1'))
    expect(res.status).toBe(500)
  })

  it('returns 400 when character_name is not a string', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const req = new Request('http://localhost/api/campaign/abc/player', {
      method: 'PATCH',
      body: JSON.stringify({ character_name: 42, character_class: 'Mage' }),
    })
    const res = await PATCH(req, makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('returns 400 on invalid JSON body', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const req = new Request('http://localhost/api/campaign/abc/player', {
      method: 'PATCH',
      body: 'not-valid-json',
    })
    const res = await PATCH(req, makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('returns 200 with updated player when all fields provided including backstory', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const updatedPlayer = {
      id: 'player-1',
      user_id: 'user-123',
      campaign_id: 'abc',
      character_name: 'Arwen',
      character_class: 'Mage',
      character_backstory: 'A wandering mage from the north.',
      is_ready: false,
    }
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: updatedPlayer, error: null }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await PATCH(
      makeRequest({ character_name: 'Arwen', character_class: 'Mage', character_backstory: 'A wandering mage from the north.' }),
      makeParams('abc')
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.player.character_name).toBe('Arwen')
    expect(body.player.character_class).toBe('Mage')
    expect(body.player.character_backstory).toBe('A wandering mage from the north.')
    expect(body.player.is_ready).toBe(false)
  })

  it('returns 200 with updated player when backstory is omitted (null)', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const updatedPlayer = {
      id: 'player-1',
      user_id: 'user-123',
      campaign_id: 'abc',
      character_name: 'Arwen',
      character_class: 'Mage',
      character_backstory: null,
      is_ready: false,
    }
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: updatedPlayer, error: null }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await PATCH(
      makeRequest({ character_name: 'Arwen', character_class: 'Mage' }),
      makeParams('abc')
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.player.character_backstory).toBeNull()
    expect(body.player.is_ready).toBe(false)
  })

  it('verifies that is_ready is reset to false in the update call', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockUser } }) },
    })
    const updatedPlayer = {
      id: 'player-1',
      user_id: 'user-123',
      campaign_id: 'abc',
      character_name: 'Arwen',
      character_class: 'Mage',
      character_backstory: null,
      is_ready: false,
    }
    const updateFn = vi.fn().mockReturnThis()
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      update: updateFn,
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: updatedPlayer, error: null }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    await PATCH(
      makeRequest({ character_name: 'Arwen', character_class: 'Mage' }),
      makeParams('abc')
    )
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({ is_ready: false })
    )
  })
})
