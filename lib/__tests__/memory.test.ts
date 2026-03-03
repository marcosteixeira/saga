import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({ from: mockFrom }))
}))

describe('memory', () => {
  beforeEach(() => { vi.clearAllMocks() })

  describe('getCampaignFile', () => {
    it('returns file content when found', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { content: '# World\nA dark realm...' },
                error: null
              })
            })
          })
        })
      })

      const { getCampaignFile } = await import('../memory')
      const result = await getCampaignFile('camp-1', 'WORLD.md')
      expect(result).toBe('# World\nA dark realm...')
    })

    it('returns null when file not found', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116' }
              })
            })
          })
        })
      })

      const { getCampaignFile } = await import('../memory')
      const result = await getCampaignFile('camp-1', 'MISSING.md')
      expect(result).toBeNull()
    })
  })

  describe('upsertCampaignFile', () => {
    it('calls upsert with correct data', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null })
      mockFrom.mockReturnValue({ upsert: mockUpsert })

      const { upsertCampaignFile } = await import('../memory')
      await upsertCampaignFile('camp-1', 'WORLD.md', '# New content')

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          campaign_id: 'camp-1',
          filename: 'WORLD.md',
          content: '# New content'
        }),
        expect.any(Object)
      )
    })
  })

  describe('appendCharacterToFile', () => {
    it('appends character section to CHARACTERS.md', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null })
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { content: '## Aragorn\n- **Player:** player1\n' },
                error: null,
              }),
            }),
          }),
        }),
        upsert: mockUpsert,
      })

      const { appendCharacterToFile } = await import('../memory')
      await appendCharacterToFile('camp-1', {
        id: 'p2',
        username: 'gandalf_player',
        character_name: 'Gandalf',
        character_class: 'Wizard',
        character_backstory: 'An ancient wizard of great power.',
      } as any)

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: 'CHARACTERS.md',
          content: expect.stringContaining('## Gandalf'),
        }),
        expect.any(Object)
      )
      const content = mockUpsert.mock.calls[0][0].content as string
      expect(content).toContain('gandalf_player')
      expect(content).toContain('Wizard')
      expect(content).toContain('20/20')
      expect(content).toContain('Aragorn') // existing character preserved
    })
  })

  describe('initializeCampaignFiles', () => {
    it('creates all 5 base files', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null })
      mockFrom.mockReturnValue({ upsert: mockUpsert })

      const { initializeCampaignFiles } = await import('../memory')
      await initializeCampaignFiles('camp-1', '# Generated World')

      // Should be called for each of the 5 files
      expect(mockUpsert).toHaveBeenCalledTimes(5)
    })
  })
})
