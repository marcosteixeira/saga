import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubGlobal('Deno', {
  env: { get: () => 'test-value' },
  serve: vi.fn()
});

// Mock the broadcast helper before importing index
vi.mock('../generate-world/broadcast.ts', () => ({
  broadcastToChannel: vi.fn().mockResolvedValue(undefined),
}));

describe('extractImageBytes', () => {
  it('returns base64 data from Gemini response', async () => {
    const { extractImageBytes } = await import('../index.ts');
    const fakeResponse = {
      candidates: [
        { content: { parts: [{ inlineData: { data: 'abc123base64', mimeType: 'image/png' } }] } }
      ]
    };
    expect(extractImageBytes(fakeResponse as any)).toBe('abc123base64');
  });

  it('throws when no image data in response', async () => {
    const { extractImageBytes } = await import('../index.ts');
    const fakeResponse = {
      candidates: [{ content: { parts: [{ text: 'No image' }] } }]
    };
    expect(() => extractImageBytes(fakeResponse as any)).toThrow('No image data');
  });
});

describe('getStoragePath', () => {
  it('returns correct path for world cover', async () => {
    const { getStoragePath } = await import('../index.ts');
    expect(getStoragePath('world', 'world-123', 'cover')).toBe('worlds/world-123/cover.png');
  });

  it('returns correct path for world map', async () => {
    const { getStoragePath } = await import('../index.ts');
    expect(getStoragePath('world', 'world-123', 'map')).toBe('worlds/world-123/map.png');
  });

  it('returns correct path for campaign cover', async () => {
    const { getStoragePath } = await import('../index.ts');
    expect(getStoragePath('campaign', 'campaign-456', 'cover')).toBe('campaigns/campaign-456/cover.png');
  });

  it('returns correct path for player character', async () => {
    const { getStoragePath } = await import('../index.ts');
    expect(getStoragePath('player', 'player-789', 'character')).toBe('players/player-789/character.png');
  });
});

describe('broadcastImageReady', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('broadcasts to world:{worldId} with image:ready event for a world image', async () => {
    const { broadcastImageReady } = await import('../index.ts');
    const { broadcastToChannel } = await import('../generate-world/broadcast.ts');

    await broadcastImageReady(
      'https://example.supabase.co',
      'service-key',
      'world-abc',
      'world',
      'world-abc',
      'cover',
      'https://cdn.example.com/cover.png',
      'image-uuid',
    );

    expect(broadcastToChannel).toHaveBeenCalledOnce();
    expect(broadcastToChannel).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'service-key',
      'world:world-abc',
      'image:ready',
      {
        entity_type: 'world',
        entity_id: 'world-abc',
        image_type: 'cover',
        url: 'https://cdn.example.com/cover.png',
        image_id: 'image-uuid',
      }
    );
  });

  it('broadcasts to world:{worldId} with image:ready event for a campaign image', async () => {
    const { broadcastImageReady } = await import('../index.ts');
    const { broadcastToChannel } = await import('../generate-world/broadcast.ts');

    await broadcastImageReady(
      'https://example.supabase.co',
      'service-key',
      'world-xyz',
      'campaign',
      'campaign-789',
      'cover',
      'https://cdn.example.com/cover.png',
      'image-uuid-2',
    );

    expect(broadcastToChannel).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'service-key',
      'world:world-xyz',
      'image:ready',
      {
        entity_type: 'campaign',
        entity_id: 'campaign-789',
        image_type: 'cover',
        url: 'https://cdn.example.com/cover.png',
        image_id: 'image-uuid-2',
      }
    );
  });
});
