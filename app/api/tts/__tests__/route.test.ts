import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockGetUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createAuthServerClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
    })
  ),
}))

describe('POST /api/tts', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-key')
    vi.stubEnv('ELEVENLABS_VOICE_ID', 'test-voice-id')
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  })

  it('returns 401 if user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello adventurer' }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 if text exceeds 5000 chars', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({ text: 'a'.repeat(5001) }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('streams audio from ElevenLabs and returns audio/mpeg', async () => {
    const fakeBody = new ReadableStream()
    mockFetch.mockResolvedValue(
      new Response(fakeBody, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' }
      })
    )

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello adventurer' }),
      headers: { 'content-type': 'application/json' }
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/mpeg')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.elevenlabs.io/v1/text-to-speech/test-voice-id/stream',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'xi-api-key': 'test-key',
          'content-type': 'application/json'
        })
      })
    )
  })

  it('returns 400 if text is missing', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 429 if ElevenLabs returns 429', async () => {
    mockFetch.mockResolvedValue(new Response('error', { status: 429 }))
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello' }),
      headers: { 'content-type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(429)
  })

  it('returns 502 if ElevenLabs returns 500', async () => {
    mockFetch.mockResolvedValue(new Response('error', { status: 500 }))
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello' }),
      headers: { 'content-type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(502)
  })

  it('returns 500 if ELEVENLABS_API_KEY is missing', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', '')
    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello' }),
      headers: { 'content-type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})
