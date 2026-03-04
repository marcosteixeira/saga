import { describe, expect, it, vi } from 'vitest'
import type { World } from '@/types'
import { fetchSelectableWorlds } from '@/components/campaign/world-vault'

function makeWorld(overrides: Partial<World> = {}): World {
  return {
    id: overrides.id ?? 'w1',
    user_id: overrides.user_id ?? 'u1',
    name: overrides.name ?? 'World 1',
    description: overrides.description ?? 'desc',
    world_content: overrides.world_content ?? null,
    cover_image_url: overrides.cover_image_url ?? null,
    map_image_url: overrides.map_image_url ?? null,
    status: overrides.status ?? 'ready',
    classes: overrides.classes ?? [],
    created_at: overrides.created_at ?? '2026-03-04T00:00:00.000Z',
  }
}

describe('fetchSelectableWorlds', () => {
  it('returns only ready worlds from the API response', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        worlds: [
          makeWorld({ id: 'ready-1', status: 'ready' }),
          makeWorld({ id: 'gen-1', status: 'generating' }),
          makeWorld({ id: 'error-1', status: 'error' }),
        ],
      }),
    })

    const result = await fetchSelectableWorlds(fetcher)

    expect(result.ok).toBe(true)
    expect(result.error).toBeNull()
    expect(result.worlds.map(w => w.id)).toEqual(['ready-1'])
  })

  it('returns a recoverable error when /api/world fails', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Unauthorized' }),
    })

    const result = await fetchSelectableWorlds(fetcher)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Unauthorized')
    expect(result.worlds).toEqual([])
  })
})
