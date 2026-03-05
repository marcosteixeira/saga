import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
  createAuthServerClient: vi.fn(),
}))

vi.mock('@/lib/realtime-broadcast', () => ({
  broadcastCampaignEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/anthropic', () => ({
  anthropic: { messages: { create: vi.fn() } },
}))

import { createServerSupabaseClient, createAuthServerClient } from '@/lib/supabase/server'
import { broadcastCampaignEvent } from '@/lib/realtime-broadcast'
import { POST, generateSessionContent } from '../route'
import { anthropic } from '@/lib/anthropic'

const mockHostUser = { id: 'host-user-id' }

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeRequest() {
  return new Request('http://localhost/api/campaign/abc/start', { method: 'POST' })
}

describe('POST /api/campaign/[id]/start', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
    })
    const res = await POST(makeRequest(), makeParams('abc'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign not found', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockHostUser } }) },
    })
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await POST(makeRequest(), makeParams('abc'))
    expect(res.status).toBe(404)
  })

  it('returns 403 when user is not the host', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: 'not-the-host' } } }) },
    })
    const campaign = { id: 'abc', host_user_id: 'host-user-id', status: 'lobby' }
    const mockDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: campaign, error: null }),
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await POST(makeRequest(), makeParams('abc'))
    expect(res.status).toBe(403)
  })

  it('returns 400 when not all players are ready', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockHostUser } }) },
    })
    const campaign = { id: 'abc', host_user_id: 'host-user-id', status: 'lobby' }
    const players = [
      { id: 'p1', is_ready: true },
      { id: 'p2', is_ready: false },
    ]
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'campaigns') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: campaign, error: null }),
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: players, error: null }),
        }
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await POST(makeRequest(), makeParams('abc'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/not ready/i)
  })

  it('returns 200, updates campaign to active, and broadcasts game:starting when all ready', async () => {
    ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: mockHostUser } }) },
    })
    const campaign = { id: 'abc', host_user_id: 'host-user-id', status: 'lobby', world_id: 'world-1' }
    const players = [
      { id: 'p1', is_ready: true, character_name: 'Arwen', character_class: 'Mage', character_backstory: null, username: 'alice' },
    ]
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq })
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'campaigns') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: campaign, error: null }),
          update: updateFn,
        }
        if (table === 'players') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: players, error: null }),
        }
        return {}
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    const res = await POST(makeRequest(), makeParams('abc'))
    expect(res.status).toBe(200)
    expect(updateFn).toHaveBeenCalledWith({ status: 'active' })
    expect(broadcastCampaignEvent).toHaveBeenCalledWith('abc', 'game:starting', {})
  })
})

describe('generateSessionContent', () => {
  beforeEach(() => vi.clearAllMocks())

  const players = [
    { id: 'p1', character_name: 'Arwen', character_class: 'Mage', character_backstory: 'A wanderer', username: 'alice' },
  ]

  it('creates a session row with session_number 1 and present_player_ids', async () => {
    const insertSingle = vi.fn().mockResolvedValue({ data: { id: 'session-1' }, error: null })
    const sessionInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: insertSingle,
    })
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const sessionUpdate = vi.fn().mockReturnValue({ eq: updateEq })
    ;(anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        opening_situation: 'You stand at the gates.',
        starting_hooks: ['Hook A', 'Hook B'],
      }) }],
    })
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'sessions') return { insert: sessionInsert, update: sessionUpdate }
        if (table === 'worlds') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { world_content: 'World lore...', name: 'Eldoria' }, error: null }),
        }
        return {}
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    await generateSessionContent('campaign-1', 'world-1', players)
    expect(sessionInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        campaign_id: 'campaign-1',
        session_number: 1,
        present_player_ids: ['p1'],
      })
    )
  })

  it('calls Claude with world content and player info', async () => {
    const insertSingle = vi.fn().mockResolvedValue({ data: { id: 'session-1' }, error: null })
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'sessions') return {
          insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), single: insertSingle }),
          update: vi.fn().mockReturnValue({ eq: updateEq }),
        }
        if (table === 'worlds') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { world_content: 'World lore here', name: 'Eldoria' }, error: null }),
        }
        return {}
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    ;(anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        opening_situation: 'You stand at the gates.',
        starting_hooks: ['Hook A'],
      }) }],
    })
    await generateSessionContent('campaign-1', 'world-1', players)
    const call = (anthropic.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const userMsg = call.messages.find((m: { role: string }) => m.role === 'user')
    expect(userMsg.content).toContain('World lore here')
    expect(userMsg.content).toContain('Arwen')
    expect(userMsg.content).toContain('Mage')
  })

  it('saves opening_situation and starting_hooks to session row', async () => {
    const insertSingle = vi.fn().mockResolvedValue({ data: { id: 'session-1' }, error: null })
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq })
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'sessions') return {
          insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), single: insertSingle }),
          update: updateFn,
        }
        if (table === 'worlds') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { world_content: 'Lore', name: 'World' }, error: null }),
        }
        return {}
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    ;(anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        opening_situation: 'You stand at the gates.',
        starting_hooks: ['Investigate the noise', 'Follow the stranger'],
      }) }],
    })
    await generateSessionContent('campaign-1', 'world-1', players)
    expect(updateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        opening_situation: 'You stand at the gates.',
        starting_hooks: ['Investigate the noise', 'Follow the stranger'],
      })
    )
  })

  it('broadcasts game:started with session_id and opening content', async () => {
    const insertSingle = vi.fn().mockResolvedValue({ data: { id: 'session-42' }, error: null })
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === 'sessions') return {
          insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), single: insertSingle }),
          update: vi.fn().mockReturnValue({ eq: updateEq }),
        }
        if (table === 'worlds') return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { world_content: 'Lore', name: 'World' }, error: null }),
        }
        return {}
      }),
    }
    ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
    ;(anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        opening_situation: 'The city burns.',
        starting_hooks: ['Flee', 'Fight'],
      }) }],
    })
    await generateSessionContent('campaign-1', 'world-1', players)
    expect(broadcastCampaignEvent).toHaveBeenCalledWith(
      'campaign-1',
      'game:started',
      expect.objectContaining({
        session_id: 'session-42',
        opening_situation: 'The city burns.',
        starting_hooks: ['Flee', 'Fight'],
      })
    )
  })
})
