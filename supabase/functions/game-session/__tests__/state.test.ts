import { describe, it, expect, beforeEach } from 'vitest'
import {
  sessions,
  getOrCreateSession,
  registerConnection,
  removeConnection,
  broadcastToAll,
} from '../state.ts'

// Minimal WebSocket mock
function makeMockSocket(): { send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; sentMessages: string[] } {
  const sentMessages: string[] = []
  return {
    send: vi.fn((msg: string) => sentMessages.push(msg)),
    close: vi.fn(),
    sentMessages,
  }
}

import { vi } from 'vitest'

beforeEach(() => {
  sessions.clear()
})

describe('getOrCreateSession', () => {
  it('creates a new session when none exists', () => {
    const session = getOrCreateSession('campaign-1')
    expect(session).toBeDefined()
    expect(session.connections.size).toBe(0)
    expect(session.debounceTimer).toBeNull()
    expect(session.isProcessing).toBe(false)
  })

  it('returns the same session on repeated calls', () => {
    const s1 = getOrCreateSession('campaign-1')
    const s2 = getOrCreateSession('campaign-1')
    expect(s1).toBe(s2)
  })
})

describe('registerConnection', () => {
  it('adds socket to session connections', () => {
    const socket = makeMockSocket()
    registerConnection('campaign-1', 'player-1', socket as unknown as WebSocket)
    const session = sessions.get('campaign-1')
    expect(session?.connections.get('player-1')).toBe(socket)
  })
})

describe('removeConnection', () => {
  it('removes socket from session connections', () => {
    const socket = makeMockSocket()
    // Register two players so session isn't deleted when first one leaves
    registerConnection('campaign-1', 'player-1', socket as unknown as WebSocket)
    registerConnection('campaign-1', 'player-2', socket as unknown as WebSocket)
    removeConnection('campaign-1', 'player-1')
    const session = sessions.get('campaign-1')
    expect(session?.connections.has('player-1')).toBe(false)
    expect(session?.connections.has('player-2')).toBe(true)
  })

  it('deletes session when no connections remain and no pending messages', () => {
    const socket = makeMockSocket()
    registerConnection('campaign-1', 'player-1', socket as unknown as WebSocket)
    removeConnection('campaign-1', 'player-1')
    expect(sessions.has('campaign-1')).toBe(false)
  })

  it('keeps session when isProcessing is true', () => {
    const socket = makeMockSocket()
    registerConnection('campaign-1', 'player-1', socket as unknown as WebSocket)
    const session = sessions.get('campaign-1')!
    session.isProcessing = true
    removeConnection('campaign-1', 'player-1')
    expect(sessions.has('campaign-1')).toBe(true)
  })

  it('does not remove a newer socket when a stale socket closes later', () => {
    const oldSocket = makeMockSocket()
    const newSocket = makeMockSocket()

    registerConnection('campaign-1', 'player-1', oldSocket as unknown as WebSocket)
    registerConnection('campaign-1', 'player-1', newSocket as unknown as WebSocket)

    removeConnection('campaign-1', 'player-1', oldSocket as unknown as WebSocket)

    const session = sessions.get('campaign-1')
    expect(session?.connections.get('player-1')).toBe(newSocket)
  })
})

describe('broadcastToAll', () => {
  it('sends message to all connected players', () => {
    const s1 = makeMockSocket()
    const s2 = makeMockSocket()
    registerConnection('campaign-1', 'player-1', s1 as unknown as WebSocket)
    registerConnection('campaign-1', 'player-2', s2 as unknown as WebSocket)
    broadcastToAll('campaign-1', { type: 'chunk', content: 'hello' })
    expect(s1.send).toHaveBeenCalledWith(JSON.stringify({ type: 'chunk', content: 'hello' }))
    expect(s2.send).toHaveBeenCalledWith(JSON.stringify({ type: 'chunk', content: 'hello' }))
  })

  it('excludes specified player from broadcast', () => {
    const s1 = makeMockSocket()
    const s2 = makeMockSocket()
    registerConnection('campaign-1', 'player-1', s1 as unknown as WebSocket)
    registerConnection('campaign-1', 'player-2', s2 as unknown as WebSocket)
    broadcastToAll('campaign-1', { type: 'player:action', content: 'hi' }, 'player-1')
    expect(s1.send).not.toHaveBeenCalled()
    expect(s2.send).toHaveBeenCalled()
  })
})
