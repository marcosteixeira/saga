import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExchangeCode = vi.fn()
const mockCreateServerClient = vi.fn(() => ({
  auth: { exchangeCodeForSession: mockExchangeCode },
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: mockCreateServerClient,
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({
    getAll: () => [],
    set: vi.fn(),
  })),
}))

describe('GET /auth/callback', () => {
  beforeEach(() => vi.clearAllMocks())

  it('exchanges code and redirects to /redirect param on success', async () => {
    mockExchangeCode.mockResolvedValue({ error: null })
    const { GET } = await import('../route')
    const req = new Request(
      'http://localhost/auth/callback?code=test-code&redirect=/campaign/new'
    )
    const res = await GET(req as any)
    expect(mockExchangeCode).toHaveBeenCalledWith('test-code')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/campaign/new')
  })

  it('redirects to / when no redirect param', async () => {
    mockExchangeCode.mockResolvedValue({ error: null })
    const { GET } = await import('../route')
    const req = new Request('http://localhost/auth/callback?code=test-code')
    const res = await GET(req as any)
    expect(res.headers.get('location')).toBe('http://localhost/')
  })

  it('redirects to /login?error=auth_failed when exchange fails', async () => {
    mockExchangeCode.mockResolvedValue({ error: { message: 'invalid code' } })
    const { GET } = await import('../route')
    const req = new Request('http://localhost/auth/callback?code=bad-code')
    const res = await GET(req as any)
    expect(res.headers.get('location')).toContain('/login')
    expect(res.headers.get('location')).toContain('error=auth_failed')
  })

  it('redirects to /login?error=auth_failed when no code in URL', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/auth/callback')
    const res = await GET(req as any)
    expect(res.headers.get('location')).toContain('/login')
    expect(res.headers.get('location')).toContain('error=auth_failed')
    expect(mockExchangeCode).not.toHaveBeenCalled()
  })
})
