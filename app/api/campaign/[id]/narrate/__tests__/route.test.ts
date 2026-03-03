import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Supabase mock ---
const mockCampaignSingle = vi.fn()
const mockFilesSelect = vi.fn()
const mockPlayersSelect = vi.fn()
const mockMessageInsert = vi.fn()
const mockMessageHistoryQuery = vi.fn()
const mockBroadcastSend = vi.fn()
const mockChannelFn = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'campaigns') {
        return {
          select: () => ({
            eq: () => ({
              single: mockCampaignSingle,
            }),
          }),
        }
      }
      if (table === 'campaign_files') {
        return {
          select: () => ({
            eq: mockFilesSelect,
          }),
        }
      }
      if (table === 'players') {
        return {
          select: () => ({
            eq: mockPlayersSelect,
          }),
        }
      }
      if (table === 'messages') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: mockMessageHistoryQuery,
                }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: mockMessageInsert,
            }),
          }),
        }
      }
    },
    channel: mockChannelFn,
  })),
}))

// --- Anthropic streaming mock ---
const mockStreamText = vi.fn()

vi.mock('@/lib/anthropic', () => ({
  anthropic: {
    messages: {
      stream: mockStreamText,
    },
  },
}))

// --- GM system prompt mock ---
vi.mock('@/lib/prompts/gm-system', () => ({
  buildGMSystemPrompt: vi.fn(() => 'mocked-system-prompt'),
}))

// --- Message history formatter mock ---
vi.mock('@/lib/prompts/message-history', () => ({
  formatMessageHistory: vi.fn(() => []),
}))

function makeAsyncStream(chunks: string[]) {
  let finalText = chunks.join('')
  const stream = {
    [Symbol.asyncIterator]() {
      let i = 0
      return {
        async next() {
          if (i < chunks.length) {
            return { value: { type: 'content_block_delta', delta: { type: 'text_delta', text: chunks[i++] } }, done: false }
          }
          return { value: undefined, done: true }
        }
      }
    },
    async finalMessage() {
      return { content: [{ type: 'text', text: finalText }] }
    }
  }
  return stream
}

describe('POST /api/campaign/[id]/narrate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChannelFn.mockReturnValue({
      send: mockBroadcastSend.mockResolvedValue({ status: 'ok' }),
    })
    mockBroadcastSend.mockResolvedValue({ status: 'ok' })
    mockPlayersSelect.mockResolvedValue({ data: [], error: null })
  })

  it('returns 404 when campaign not found', async () => {
    mockCampaignSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign/missing/narrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': 'test-secret' },
      body: JSON.stringify({ messages: [] }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'missing' }) })
    expect(res.status).toBe(404)
  })

  it('returns 400 when campaign is not active', async () => {
    mockCampaignSingle.mockResolvedValue({
      data: { id: 'c1', status: 'lobby', current_session_id: null },
      error: null,
    })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign/c1/narrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': 'test-secret' },
      body: JSON.stringify({ messages: [] }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(400)
  })

  it('builds GM system prompt from campaign files', async () => {
    const { buildGMSystemPrompt } = await import('@/lib/prompts/gm-system')

    mockCampaignSingle.mockResolvedValue({
      data: { id: 'c1', status: 'active', current_session_id: 's1', system_description: null },
      error: null,
    })
    mockFilesSelect.mockReturnValue({
      data: [
        { filename: 'WORLD.md', content: '# World' },
        { filename: 'CHARACTERS.md', content: '# Chars' },
        { filename: 'NPCS.md', content: '# NPCs' },
        { filename: 'LOCATIONS.md', content: '# Locs' },
        { filename: 'MEMORY.md', content: '# Mem' },
      ],
      error: null,
    })
    mockMessageHistoryQuery.mockResolvedValue({ data: [], error: null })
    mockStreamText.mockReturnValue(makeAsyncStream(['Hello']))
    mockMessageInsert.mockResolvedValue({ data: { id: 'msg-1', content: 'Hello' }, error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign/c1/narrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': 'test-secret' },
      body: JSON.stringify({ messages: [] }),
    })
    await POST(req, { params: Promise.resolve({ id: 'c1' }) })

    expect(buildGMSystemPrompt).toHaveBeenCalledWith(expect.objectContaining({
      worldMd: '# World',
      charactersMd: '# Chars',
    }))
  })

  it('calls Claude with streaming and correct message history', async () => {
    mockCampaignSingle.mockResolvedValue({
      data: { id: 'c1', status: 'active', current_session_id: 's1', system_description: null },
      error: null,
    })
    mockFilesSelect.mockReturnValue({ data: [], error: null })
    mockMessageHistoryQuery.mockResolvedValue({ data: [], error: null })
    mockStreamText.mockReturnValue(makeAsyncStream(['Token1', ' Token2']))
    mockMessageInsert.mockResolvedValue({ data: { id: 'msg-2', content: 'Token1 Token2' }, error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign/c1/narrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': 'test-secret' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'I attack' }] }),
    })
    await POST(req, { params: Promise.resolve({ id: 'c1' }) })

    expect(mockStreamText).toHaveBeenCalledWith(expect.objectContaining({
      model: 'claude-sonnet-4-6',
      stream: true,
    }))
  })

  it('saves completed narration to messages table', async () => {
    mockCampaignSingle.mockResolvedValue({
      data: { id: 'c1', status: 'active', current_session_id: 's1', system_description: null },
      error: null,
    })
    mockFilesSelect.mockReturnValue({ data: [], error: null })
    mockMessageHistoryQuery.mockResolvedValue({ data: [], error: null })
    mockStreamText.mockReturnValue(makeAsyncStream(['The goblin falls.']))
    mockMessageInsert.mockResolvedValue({ data: { id: 'saved-msg', content: 'The goblin falls.' }, error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign/c1/narrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': 'test-secret' },
      body: JSON.stringify({ messages: [] }),
    })
    await POST(req, { params: Promise.resolve({ id: 'c1' }) })

    // Messages insert should have been called with narration type
    expect(mockMessageInsert).toHaveBeenCalled()
  })

  it('returns message ID on completion', async () => {
    mockCampaignSingle.mockResolvedValue({
      data: { id: 'c1', status: 'active', current_session_id: 's1', system_description: null },
      error: null,
    })
    mockFilesSelect.mockReturnValue({ data: [], error: null })
    mockMessageHistoryQuery.mockResolvedValue({ data: [], error: null })
    mockStreamText.mockReturnValue(makeAsyncStream(['Story text']))
    mockMessageInsert.mockResolvedValue({ data: { id: 'final-msg-id', content: 'Story text' }, error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost/api/campaign/c1/narrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': 'test-secret' },
      body: JSON.stringify({ messages: [] }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'c1' }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.messageId).toBe('final-msg-id')
  })
})
