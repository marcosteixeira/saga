import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}))

// Mock memory module
vi.mock('@/lib/memory', () => ({
  getCampaignFile: vi.fn(),
  upsertCampaignFile: vi.fn(),
}))

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getCampaignFile, upsertCampaignFile } from '@/lib/memory'
import { applyMemoryUpdate } from '../memory-updater'

const mockSupabase = {
  from: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)
})

describe('applyMemoryUpdate', () => {
  it('updates MEMORY.md with new content', async () => {
    vi.mocked(upsertCampaignFile).mockResolvedValue(undefined)

    await applyMemoryUpdate('campaign-1', { memory_md: 'Party found the artifact.' })

    expect(upsertCampaignFile).toHaveBeenCalledWith(
      'campaign-1',
      'MEMORY.md',
      'Party found the artifact.'
    )
  })

  it('appends new NPC to NPCS.md', async () => {
    vi.mocked(getCampaignFile).mockResolvedValue('# NPCs\n\n## Bartender\n- Status: Alive\n')
    vi.mocked(upsertCampaignFile).mockResolvedValue(undefined)

    await applyMemoryUpdate('campaign-1', {
      npcs: [{ name: 'Wizard', status: 'Alive', disposition: 'Friendly', note: 'Sells potions' }],
    })

    const callArgs = vi.mocked(upsertCampaignFile).mock.calls[0]
    expect(callArgs[1]).toBe('NPCS.md')
    expect(callArgs[2]).toContain('## Wizard')
    expect(callArgs[2]).toContain('Bartender') // existing NPC still there
  })

  it('updates existing NPC in NPCS.md', async () => {
    vi.mocked(getCampaignFile).mockResolvedValue('## Wizard\n- Status: Alive\n- Note: Old note\n')
    vi.mocked(upsertCampaignFile).mockResolvedValue(undefined)

    await applyMemoryUpdate('campaign-1', {
      npcs: [{ name: 'Wizard', status: 'Dead', note: 'Slain by the party' }],
    })

    const callArgs = vi.mocked(upsertCampaignFile).mock.calls[0]
    expect(callArgs[2]).toContain('## Wizard')
    expect(callArgs[2]).toContain('Dead')
    // Should not duplicate
    const matches = (callArgs[2] as string).match(/## Wizard/g)
    expect(matches).toHaveLength(1)
  })

  it('appends new location to LOCATIONS.md', async () => {
    vi.mocked(getCampaignFile).mockResolvedValue('## Old Town\n- Status: Safe\n')
    vi.mocked(upsertCampaignFile).mockResolvedValue(undefined)

    await applyMemoryUpdate('campaign-1', {
      locations: [{ name: 'Dark Forest', status: 'Dangerous', note: 'Full of wolves' }],
    })

    const callArgs = vi.mocked(upsertCampaignFile).mock.calls[0]
    expect(callArgs[1]).toBe('LOCATIONS.md')
    expect(callArgs[2]).toContain('## Dark Forest')
    expect(callArgs[2]).toContain('Old Town')
  })

  it('updates player stats in database', async () => {
    vi.mocked(getCampaignFile).mockResolvedValue('')
    vi.mocked(upsertCampaignFile).mockResolvedValue(undefined)

    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) })
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'player-1', stats: { hp: 20 } } }) })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: mockEq,
        }),
      }),
      update: mockUpdate,
    })

    await applyMemoryUpdate('campaign-1', {
      character_updates: [{ name: 'Gandalf', hp: 15, note: 'Took damage' }],
    })

    expect(mockUpdate).toHaveBeenCalledWith({ stats: { hp: 15 } })
  })

  it('handles update with no fields gracefully', async () => {
    await expect(applyMemoryUpdate('campaign-1', {})).resolves.not.toThrow()
  })
})
