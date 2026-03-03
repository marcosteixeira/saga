import { describe, it, expect, vi } from 'vitest'

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
  it('calls createServerClient with url, key, and cookie handlers', async () => {
    const { createAuthServerClient } = await import('../server')
    await createAuthServerClient()
    expect(mockCreateServerClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ cookies: expect.any(Object) })
    )
  })
})
