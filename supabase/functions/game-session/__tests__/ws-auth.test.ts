import { describe, expect, it } from 'vitest';
import { extractJwtFromProtocolHeader } from '../ws-auth.ts';

describe('extractJwtFromProtocolHeader', () => {
  it('extracts jwt token from subprotocol list', () => {
    expect(extractJwtFromProtocolHeader('json, jwt-abc.def.ghi')).toEqual({
      protocol: 'jwt-abc.def.ghi',
      token: 'abc.def.ghi'
    });
  });

  it('returns null token when jwt protocol is missing', () => {
    expect(extractJwtFromProtocolHeader('json, msgpack')).toEqual({
      protocol: null,
      token: null
    });
  });
});
