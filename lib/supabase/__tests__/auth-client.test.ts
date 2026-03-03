import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateServerClient = vi.fn(() => ({ auth: { getUser: vi.fn() } }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: mockCreateServerClient,
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({
    getAll: () => [{ name: 'sb-token', value: 'abc' }],
    set: vi.fn(),
  })),
}))

describe('createAuthServerClient', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls createServerClient with correct url, key, and cookie handlers', async () => {
    const { createAuthServerClient } = await import('../server')
    await createAuthServerClient()
    expect(mockCreateServerClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-anon-key',
      expect.objectContaining({ cookies: expect.any(Object) })
    )
  })
})
