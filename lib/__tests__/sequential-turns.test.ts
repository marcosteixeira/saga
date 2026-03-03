import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
const mockChannel = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: mockFrom,
    channel: mockChannel,
  })),
}))

import { advanceTurn, getCurrentTurnPlayer } from '../sequential-turns'

// Build a chainable Supabase query mock
function makeQuery(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  chain.single = vi.fn().mockResolvedValue(result)
  chain.then = (fn: (v: typeof result) => unknown) => Promise.resolve(result).then(fn)
  const wrap = () => chain
  chain.eq = vi.fn(wrap)
  chain.in = vi.fn(wrap)
  chain.select = vi.fn(wrap)
  chain.update = vi.fn(wrap)
  return chain
}

function makeChannelMock() {
  return { send: vi.fn().mockResolvedValue({}) }
}

describe('advanceTurn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('advances to the next player in order', async () => {
    const campaign = {
      id: 'c1',
      turn_state: { order: ['p1', 'p2', 'p3'], current_index: 0, round: 1 },
    }
    const players = [
      { id: 'p1', status: 'active', absence_mode: 'skip' },
      { id: 'p2', status: 'active', absence_mode: 'skip' },
      { id: 'p3', status: 'active', absence_mode: 'skip' },
    ]

    const campaignChain = makeQuery({ data: campaign, error: null })
    const playersChain = makeQuery({ data: players, error: null })
    const updateChain = makeQuery({ data: null, error: null })
    const channelMock = makeChannelMock()

    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaigns') return campaignChain
      if (table === 'players') return playersChain
      return makeQuery({ data: null, error: null })
    })
    ;(campaignChain.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain)
    mockChannel.mockReturnValue(channelMock)

    const result = await advanceTurn('c1')

    expect(result.nextPlayerId).toBe('p2')
    expect(result.roundComplete).toBe(false)
    expect(result.newRound).toBe(1)
  })

  it('wraps around at end of order (new round)', async () => {
    const campaign = {
      id: 'c1',
      turn_state: { order: ['p1', 'p2', 'p3'], current_index: 2, round: 1 },
    }
    const players = [
      { id: 'p1', status: 'active', absence_mode: 'skip' },
      { id: 'p2', status: 'active', absence_mode: 'skip' },
      { id: 'p3', status: 'active', absence_mode: 'skip' },
    ]

    const campaignChain = makeQuery({ data: campaign, error: null })
    const playersChain = makeQuery({ data: players, error: null })
    const updateChain = makeQuery({ data: null, error: null })
    const channelMock = makeChannelMock()

    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaigns') return campaignChain
      if (table === 'players') return playersChain
      return makeQuery({ data: null, error: null })
    })
    ;(campaignChain.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain)
    mockChannel.mockReturnValue(channelMock)

    const result = await advanceTurn('c1')

    expect(result.nextPlayerId).toBe('p1')
    expect(result.roundComplete).toBe(true)
    expect(result.newRound).toBe(2)
  })

  it('skips dead players', async () => {
    const campaign = {
      id: 'c1',
      turn_state: { order: ['p1', 'p2', 'p3'], current_index: 0, round: 1 },
    }
    const players = [
      { id: 'p1', status: 'active', absence_mode: 'skip' },
      { id: 'p2', status: 'dead', absence_mode: 'skip' },
      { id: 'p3', status: 'active', absence_mode: 'skip' },
    ]

    const campaignChain = makeQuery({ data: campaign, error: null })
    const playersChain = makeQuery({ data: players, error: null })
    const updateChain = makeQuery({ data: null, error: null })
    const channelMock = makeChannelMock()

    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaigns') return campaignChain
      if (table === 'players') return playersChain
      return makeQuery({ data: null, error: null })
    })
    ;(campaignChain.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain)
    mockChannel.mockReturnValue(channelMock)

    const result = await advanceTurn('c1')

    expect(result.nextPlayerId).toBe('p3')
  })

  it('skips incapacitated players', async () => {
    const campaign = {
      id: 'c1',
      turn_state: { order: ['p1', 'p2', 'p3'], current_index: 0, round: 1 },
    }
    const players = [
      { id: 'p1', status: 'active', absence_mode: 'skip' },
      { id: 'p2', status: 'incapacitated', absence_mode: 'skip' },
      { id: 'p3', status: 'active', absence_mode: 'skip' },
    ]

    const campaignChain = makeQuery({ data: campaign, error: null })
    const playersChain = makeQuery({ data: players, error: null })
    const updateChain = makeQuery({ data: null, error: null })
    const channelMock = makeChannelMock()

    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaigns') return campaignChain
      if (table === 'players') return playersChain
      return makeQuery({ data: null, error: null })
    })
    ;(campaignChain.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain)
    mockChannel.mockReturnValue(channelMock)

    const result = await advanceTurn('c1')

    expect(result.nextPlayerId).toBe('p3')
  })

  it('skips absent players with skip mode', async () => {
    const campaign = {
      id: 'c1',
      turn_state: { order: ['p1', 'p2', 'p3'], current_index: 0, round: 1 },
    }
    const players = [
      { id: 'p1', status: 'active', absence_mode: 'skip' },
      { id: 'p2', status: 'absent', absence_mode: 'skip' },
      { id: 'p3', status: 'active', absence_mode: 'skip' },
    ]

    const campaignChain = makeQuery({ data: campaign, error: null })
    const playersChain = makeQuery({ data: players, error: null })
    const updateChain = makeQuery({ data: null, error: null })
    const channelMock = makeChannelMock()

    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaigns') return campaignChain
      if (table === 'players') return playersChain
      return makeQuery({ data: null, error: null })
    })
    ;(campaignChain.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain)
    mockChannel.mockReturnValue(channelMock)

    const result = await advanceTurn('c1')

    expect(result.nextPlayerId).toBe('p3')
  })

  it('includes absent players with npc mode', async () => {
    const campaign = {
      id: 'c1',
      turn_state: { order: ['p1', 'p2', 'p3'], current_index: 0, round: 1 },
    }
    const players = [
      { id: 'p1', status: 'active', absence_mode: 'skip' },
      { id: 'p2', status: 'absent', absence_mode: 'npc' },
      { id: 'p3', status: 'active', absence_mode: 'skip' },
    ]

    const campaignChain = makeQuery({ data: campaign, error: null })
    const playersChain = makeQuery({ data: players, error: null })
    const updateChain = makeQuery({ data: null, error: null })
    const channelMock = makeChannelMock()

    mockFrom.mockImplementation((table: string) => {
      if (table === 'campaigns') return campaignChain
      if (table === 'players') return playersChain
      return makeQuery({ data: null, error: null })
    })
    ;(campaignChain.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain)
    mockChannel.mockReturnValue(channelMock)

    const result = await advanceTurn('c1')

    expect(result.nextPlayerId).toBe('p2')
  })
})

describe('getCurrentTurnPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the player at current_index', async () => {
    const campaign = {
      id: 'c1',
      turn_state: { order: ['p1', 'p2', 'p3'], current_index: 1, round: 2 },
    }

    const campaignChain = makeQuery({ data: campaign, error: null })
    mockFrom.mockReturnValue(campaignChain)

    const result = await getCurrentTurnPlayer('c1')
    expect(result).toBe('p2')
  })

  it('returns null when turn_state is empty', async () => {
    const campaign = {
      id: 'c1',
      turn_state: {},
    }

    const campaignChain = makeQuery({ data: campaign, error: null })
    mockFrom.mockReturnValue(campaignChain)

    const result = await getCurrentTurnPlayer('c1')
    expect(result).toBeNull()
  })
})
