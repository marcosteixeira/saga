import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkAllPlayersSubmitted, maybeTriggerNarration } from '../turns'

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({ from: mockFrom })),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

function makePlayerRows(statuses: string[]) {
  return statuses.map((status, i) => ({ id: `p${i + 1}`, status }))
}

describe('checkAllPlayersSubmitted', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns true when all active players have submitted', async () => {
    // active players: p1, p2
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: makePlayerRows(['active', 'active']), error: null }),
        }),
      }),
    })
    // last narration: none
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    })
    // actions since last narration: p1 and p2 both submitted
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gt: vi.fn().mockResolvedValue({
                data: [{ player_id: 'p1' }, { player_id: 'p2' }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    })
    const result = await checkAllPlayersSubmitted('c1', 's1')
    expect(result.allSubmitted).toBe(true)
    expect(result.submitted).toEqual(['p1', 'p2'])
    expect(result.pending).toEqual([])
    expect(result.total).toBe(2)
  })

  it('returns false when some players have not submitted', async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: makePlayerRows(['active', 'active']), error: null }),
        }),
      }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    })
    // only p1 submitted
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gt: vi.fn().mockResolvedValue({
                data: [{ player_id: 'p1' }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    })
    const result = await checkAllPlayersSubmitted('c1', 's1')
    expect(result.allSubmitted).toBe(false)
    expect(result.pending).toContain('p2')
  })

  it('ignores dead and incapacitated players', async () => {
    // 3 players: p1 active, p2 dead, p3 active
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [{ id: 'p1', status: 'active' }, { id: 'p3', status: 'active' }],
            error: null,
          }),
        }),
      }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gt: vi.fn().mockResolvedValue({
                data: [{ player_id: 'p1' }, { player_id: 'p3' }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    })
    const result = await checkAllPlayersSubmitted('c1', 's1')
    expect(result.allSubmitted).toBe(true)
    expect(result.total).toBe(2)
  })

  it('ignores absent players (skip mode)', async () => {
    // absent players are not required to submit
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [{ id: 'p1', status: 'active' }, { id: 'p2', status: 'active' }],
            error: null,
          }),
        }),
      }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gt: vi.fn().mockResolvedValue({
                data: [{ player_id: 'p1' }, { player_id: 'p2' }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    })
    const result = await checkAllPlayersSubmitted('c1', 's1')
    expect(result.allSubmitted).toBe(true)
    expect(result.total).toBe(2)
  })

  it('handles no narration yet (start of session)', async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [{ id: 'p1', status: 'active' }], error: null }),
        }),
      }),
    })
    // No last narration
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gt: vi.fn().mockResolvedValue({ data: [{ player_id: 'p1' }], error: null }),
            }),
          }),
        }),
      }),
    })
    const result = await checkAllPlayersSubmitted('c1', 's1')
    expect(result.allSubmitted).toBe(true)
  })
})

describe('maybeTriggerNarration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('triggers narration when all players have submitted', async () => {
    // active players: p1
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [{ id: 'p1', status: 'active' }], error: null }),
        }),
      }),
    })
    // last narration: none
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    })
    // p1 submitted
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gt: vi.fn().mockResolvedValue({ data: [{ player_id: 'p1' }], error: null }),
            }),
          }),
        }),
      }),
    })
    mockFetch.mockResolvedValue({ ok: true })

    const triggered = await maybeTriggerNarration('c1', 's1')
    expect(triggered).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/campaign/c1/narrate'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('does not trigger narration when players are pending', async () => {
    // 2 active players
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: makePlayerRows(['active', 'active']), error: null }),
        }),
      }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
    })
    // only p1 submitted
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gt: vi.fn().mockResolvedValue({ data: [{ player_id: 'p1' }], error: null }),
            }),
          }),
        }),
      }),
    })

    const triggered = await maybeTriggerNarration('c1', 's1')
    expect(triggered).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
