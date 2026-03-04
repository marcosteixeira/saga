import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}))

// Stub next/headers (not used in proxy but may be imported transitively)
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

describe('proxy', () => {
  beforeEach(() => vi.clearAllMocks())

  it('redirects unauthenticated user from /campaign/new to /login', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { proxy } = await import('../proxy')
    const req = new NextRequest('http://localhost/campaign/new')
    const res = await proxy(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
    expect(res.headers.get('location')).toContain('redirect=%2Fcampaign%2Fnew')
  })

  it('allows authenticated user through to /campaign/new', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } })
    const { proxy } = await import('../proxy')
    const req = new NextRequest('http://localhost/campaign/new')
    const res = await proxy(req)
    expect(res.status).not.toBe(307)
  })

  it('allows unauthenticated access to /login', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { proxy } = await import('../proxy')
    const req = new NextRequest('http://localhost/login')
    const res = await proxy(req)
    expect(res.status).not.toBe(307)
  })

  it('allows unauthenticated access to /', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { proxy } = await import('../proxy')
    const req = new NextRequest('http://localhost/')
    const res = await proxy(req)
    expect(res.status).not.toBe(307)
  })

  it('redirects unauthenticated user from /campaign/some-id sub-path to /login', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { proxy } = await import('../proxy')
    const req = new NextRequest('http://localhost/campaign/abc-123/lobby')
    const res = await proxy(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })
})
