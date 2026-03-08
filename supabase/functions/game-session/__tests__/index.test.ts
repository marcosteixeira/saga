import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Deno globals before any imports
vi.stubGlobal('Deno', {
  env: {
    get: (key: string) => {
      const env: Record<string, string> = {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-key',
        SUPABASE_ANON_KEY: 'anon-key',
        OPENAI_API_KEY: 'openai-key',
      }
      return env[key] ?? ''
    },
  },
  serve: vi.fn(),
  upgradeWebSocket: vi.fn(() => ({
    socket: { onopen: null, onmessage: null, onclose: null, onerror: null, send: vi.fn() },
    response: new Response(),
  })),
})

// ─── State integration tests (no external deps) ───────────────────────────────

import { sessions, getOrCreateSession } from '../state.ts'

beforeEach(() => {
  sessions.clear()
})


describe('clientId to playerId resolution', () => {
  it('correctly maps clientIds from pending messages to playerIds', () => {
    const pending = [
      { clientId: 'client-a', playerId: 'player-1', playerName: 'Aria', content: 'Attack', clientTimestamp: 1 },
      { clientId: 'client-b', playerId: 'player-2', playerName: 'Brom', content: 'Defend', clientTimestamp: 2 },
    ]

    const clientIdToPlayerId = new Map(pending.map((m) => [m.clientId, m.playerId]))

    // Simulate what runRound does: resolve player IDs from AI response actions
    const aiActions = [
      { clientId: 'client-a', playerName: 'Aria', content: 'Attack narrated' },
      { clientId: 'client-b', playerName: 'Brom', content: 'Defend narrated' },
    ]

    const resolved = aiActions.map((a) => ({
      ...a,
      playerId: clientIdToPlayerId.get(a.clientId) ?? null,
    }))

    expect(resolved[0].playerId).toBe('player-1')
    expect(resolved[1].playerId).toBe('player-2')
  })
})

describe('round:saved message construction', () => {
  it('maps saved action messages to correct clientIds', () => {
    const actions = [
      { clientId: 'ca', playerName: 'Aria', content: 'Attacks the guard' },
      { clientId: 'cb', playerName: 'Brom', content: 'Raises shield' },
    ]
    const savedActions = [
      { id: 'db-1', campaign_id: 'c1', player_id: 'p1', content: 'Attacks the guard', type: 'action' as const, created_at: '2026-01-01' },
      { id: 'db-2', campaign_id: 'c1', player_id: 'p2', content: 'Raises shield', type: 'action' as const, created_at: '2026-01-01' },
    ]
    const savedNarration = [
      { id: 'db-3', campaign_id: 'c1', player_id: null, content: 'The guard falls.', type: 'narration' as const, created_at: '2026-01-01' },
    ]

    const roundMessages = [
      ...savedActions.map((m, i) => ({ clientId: actions[i].clientId, dbMessage: m })),
      ...savedNarration.map((m) => ({ clientId: null, dbMessage: m })),
    ]

    expect(roundMessages).toHaveLength(3)
    expect(roundMessages[0].clientId).toBe('ca')
    expect(roundMessages[1].clientId).toBe('cb')
    expect(roundMessages[2].clientId).toBeNull()
    expect(roundMessages[2].dbMessage.type).toBe('narration')
  })
})
