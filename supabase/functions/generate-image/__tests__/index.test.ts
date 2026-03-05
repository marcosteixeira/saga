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
        {
          content: {
            parts: [{ inlineData: { data: 'abc123base64', mimeType: 'image/png' } }]
          }
        }
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
  it('returns correct path for cover type', async () => {
    const { getStoragePath } = await import('../index.ts');
    expect(getStoragePath('campaign-123', 'cover')).toBe('worlds/campaign-123/cover.png');
  });

  it('returns correct path for map type', async () => {
    const { getStoragePath } = await import('../index.ts');
    expect(getStoragePath('campaign-123', 'map')).toBe('worlds/campaign-123/map.png');
  });
});

describe('getSystemPrompt', () => {
  it('returns MAP_SYSTEM_PROMPT for type "map"', async () => {
    const { getSystemPrompt } = await import('../index.ts');
    const prompt = getSystemPrompt('map');
    expect(prompt).toContain('cartographic');
  });

  it('returns IMAGE_SYSTEM_PROMPT for type "cover"', async () => {
    const { getSystemPrompt } = await import('../index.ts');
    const prompt = getSystemPrompt('cover');
    expect(prompt).toContain('tabletop RPG background art');
  });

  it('returns IMAGE_SYSTEM_PROMPT for unknown type', async () => {
    const { getSystemPrompt } = await import('../index.ts');
    const prompt = getSystemPrompt('other');
    expect(prompt).toContain('tabletop RPG background art');
  });
});
