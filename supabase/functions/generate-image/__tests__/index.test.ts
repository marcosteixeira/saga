import { describe, it, expect, vi } from 'vitest';

vi.stubGlobal('Deno', {
  env: { get: () => 'test-value' },
  serve: vi.fn()
});

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

  it('returns correct path for session scene', async () => {
    const { getStoragePath } = await import('../index.ts');
    expect(getStoragePath('session', 'session-456', 'scene')).toBe('sessions/session-456/scene.png');
  });

  it('returns correct path for player character', async () => {
    const { getStoragePath } = await import('../index.ts');
    expect(getStoragePath('player', 'player-789', 'character')).toBe('players/player-789/character.png');
  });
});
