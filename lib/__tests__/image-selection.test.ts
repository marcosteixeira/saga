import { describe, it, expect } from 'vitest'
import { pickLatestImageUrl } from '../image-selection'

type Row = {
  entity_type: string
  entity_id: string
  image_type: string
  public_url: string | null
  created_at: string
}

describe('pickLatestImageUrl', () => {
  it('returns the newest ready image URL for a given entity and type', () => {
    const rows: Row[] = [
      {
        entity_type: 'campaign',
        entity_id: 'c1',
        image_type: 'cover',
        public_url: 'https://cdn.example.com/old-cover.png',
        created_at: '2026-03-05T10:00:00.000Z',
      },
      {
        entity_type: 'campaign',
        entity_id: 'c1',
        image_type: 'cover',
        public_url: 'https://cdn.example.com/new-cover.png',
        created_at: '2026-03-05T10:05:00.000Z',
      },
      {
        entity_type: 'world',
        entity_id: 'w1',
        image_type: 'cover',
        public_url: 'https://cdn.example.com/world-cover.png',
        created_at: '2026-03-05T10:03:00.000Z',
      },
    ]

    expect(pickLatestImageUrl(rows, 'campaign', 'c1', 'cover')).toBe(
      'https://cdn.example.com/new-cover.png'
    )
  })

  it('returns null when no match exists', () => {
    const rows: Row[] = []

    expect(pickLatestImageUrl(rows, 'player', 'p1', 'character')).toBeNull()
  })
})
