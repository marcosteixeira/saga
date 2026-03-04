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

const userWithName = { user_metadata: { display_name: 'DungeonMaster42' } }
const userWithoutName = { user_metadata: {} }

describe('GET /auth/callback', () => {
  beforeEach(() => vi.clearAllMocks())

  it('exchanges code and redirects to /redirect param when user has display_name', async () => {
    mockExchangeCode.mockResolvedValue({ data: { user: userWithName }, error: null })
    const { GET } = await import('../route')
    const req = new Request(
      'http://localhost/auth/callback?code=test-code&redirect=/campaign/new'
    )
    const res = await GET(req as Request)
    expect(mockExchangeCode).toHaveBeenCalledWith('test-code')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost/campaign/new')
  })

  it('redirects to /setup when user has no display_name (first login)', async () => {
    mockExchangeCode.mockResolvedValue({ data: { user: userWithoutName }, error: null })
    const { GET } = await import('../route')
    const req = new Request(
      'http://localhost/auth/callback?code=test-code&redirect=/campaign/new'
    )
    const res = await GET(req as Request)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/setup')
    expect(res.headers.get('location')).toContain('redirect=')
  })

  it('redirects to /setup when no redirect param and no display_name', async () => {
    mockExchangeCode.mockResolvedValue({ data: { user: userWithoutName }, error: null })
    const { GET } = await import('../route')
    const req = new Request('http://localhost/auth/callback?code=test-code')
    const res = await GET(req as Request)
    expect(res.headers.get('location')).toContain('/setup')
  })

  it('redirects to / (not /setup) when user has display_name and no redirect param', async () => {
    mockExchangeCode.mockResolvedValue({ data: { user: userWithName }, error: null })
    const { GET } = await import('../route')
    const req = new Request('http://localhost/auth/callback?code=test-code')
    const res = await GET(req as Request)
    expect(res.headers.get('location')).toBe('http://localhost/')
  })

  it('redirects to /login?error=auth_failed when exchange fails', async () => {
    mockExchangeCode.mockResolvedValue({ data: null, error: { message: 'invalid code' } })
    const { GET } = await import('../route')
    const req = new Request('http://localhost/auth/callback?code=bad-code')
    const res = await GET(req as Request)
    expect(res.headers.get('location')).toContain('/login')
    expect(res.headers.get('location')).toContain('error=auth_failed')
  })

  it('redirects to / when redirect param is an external URL (open redirect protection)', async () => {
    mockExchangeCode.mockResolvedValue({ data: { user: userWithName }, error: null })
    const { GET } = await import('../route')
    const req = new Request(
      'http://localhost/auth/callback?code=test-code&redirect=//evil.com/phish'
    )
    const res = await GET(req as Request)
    expect(res.headers.get('location')).toBe('http://localhost/')
  })

  it('redirects to /login?error=auth_failed when no code in URL', async () => {
    const { GET } = await import('../route')
    const req = new Request('http://localhost/auth/callback')
    const res = await GET(req as Request)
    expect(res.headers.get('location')).toContain('/login')
    expect(res.headers.get('location')).toContain('error=auth_failed')
    expect(mockExchangeCode).not.toHaveBeenCalled()
  })
})
