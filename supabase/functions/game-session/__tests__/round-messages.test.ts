import { describe, expect, it } from 'vitest'
import { buildRoundMessages } from '../round-messages.ts'

describe('buildRoundMessages', () => {
  it('maps duplicate same-player same-content actions to distinct clientIds in order', () => {
    const actions = [
      { clientId: 'c1', playerName: 'Aria', content: 'I wait.' },
      { clientId: 'c2', playerName: 'Aria', content: 'I wait.' },
    ]
    const clientIdToPlayerId = new Map<string, string>([
      ['c1', 'p1'],
      ['c2', 'p1'],
    ])
    const savedMessages = [
      {
        id: 'm1',
        campaign_id: 'camp',
        player_id: 'p1',
        content: 'I wait.',
        type: 'action' as const,
        created_at: '2026-03-08T00:00:00Z',
      },
      {
        id: 'm2',
        campaign_id: 'camp',
        player_id: 'p1',
        content: 'I wait.',
        type: 'action' as const,
        created_at: '2026-03-08T00:00:01Z',
      },
      {
        id: 'm3',
        campaign_id: 'camp',
        player_id: null,
        content: 'Time hangs in the room.',
        type: 'narration' as const,
        created_at: '2026-03-08T00:00:02Z',
      },
    ]

    const roundMessages = buildRoundMessages({
      actions,
      savedMessages,
      clientIdToPlayerId,
    })

    expect(roundMessages[0].clientId).toBe('c1')
    expect(roundMessages[1].clientId).toBe('c2')
    expect(roundMessages[2].clientId).toBeNull()
  })
})
