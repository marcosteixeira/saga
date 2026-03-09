import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '../route'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('POST /api/tts', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-key')
    vi.stubEnv('ELEVENLABS_VOICE_ID', 'test-voice-id')
  })

  it('streams audio from ElevenLabs and returns audio/mpeg', async () => {
    const fakeBody = new ReadableStream()
    mockFetch.mockResolvedValue(
      new Response(fakeBody, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' }
      })
    )

    const req = new Request('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello adventurer', voiceId: 'test-voice-id' }),
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
    const req = new Request('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 500 if ElevenLabs returns non-ok', async () => {
    mockFetch.mockResolvedValue(new Response('error', { status: 429 }))
    const req = new Request('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello' }),
      headers: { 'content-type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })

  it('returns 500 if ELEVENLABS_API_KEY is missing', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', '')
    const req = new Request('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello' }),
      headers: { 'content-type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})
