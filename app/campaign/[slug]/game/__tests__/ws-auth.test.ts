import { describe, expect, it } from 'vitest';
import { buildGameSessionSocketConfig } from '../ws-auth';

describe('buildGameSessionSocketConfig', () => {
  it('builds websocket URL without leaking JWT in query params', () => {
    const config = buildGameSessionSocketConfig({
      supabaseUrl: 'https://example.supabase.co',
      campaignId: 'campaign-123',
      accessToken: 'header.payload.signature'
    });

    expect(config.url).toBe(
      'wss://example.supabase.co/functions/v1/game-session?campaignId=campaign-123'
    );
    expect(config.url).not.toContain('jwt=');
    expect(config.protocols).toEqual(['jwt-header.payload.signature']);
  });

  it('encodes campaign ID in websocket URL', () => {
    const config = buildGameSessionSocketConfig({
      supabaseUrl: 'https://example.supabase.co',
      campaignId: 'a/b c',
      accessToken: 'token'
    });

    expect(config.url).toContain('campaignId=a%2Fb%20c');
  });
});
