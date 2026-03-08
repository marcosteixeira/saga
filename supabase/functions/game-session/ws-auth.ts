export function extractJwtFromProtocolHeader(
  headerValue: string | null
): { protocol: string | null; token: string | null } {
  if (!headerValue) {
    return { protocol: null, token: null };
  }

  const protocol = headerValue
    .split(',')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith('jwt-') && entry.length > 4);

  if (!protocol) {
    return { protocol: null, token: null };
  }

  return { protocol, token: protocol.slice(4) };
}
