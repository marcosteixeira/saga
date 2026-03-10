// app/api/game-session/[id]/round/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockAnthropicStream } = vi.hoisted(() => ({ mockAnthropicStream: vi.fn() }))

const mockCampaignUpdate = vi.fn()
const mockCampaignSelect = vi.fn()
const mockMessagesUpdate = vi.fn()
const mockMessagesInsert = vi.fn()
const mockMessagesSelect = vi.fn()
const mockWorldSelect = vi.fn()
const mockPlayersSelect = vi.fn()
const mockBroadcastGameEvent = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'campaigns') {
        return {
          update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => mockCampaignUpdate()) })) })) })),
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: mockCampaignSelect })) })),
        }
      }
      if (table === 'messages') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => mockMessagesUpdate()) })) })) })),
          })),
          insert: vi.fn(() => ({ select: mockMessagesInsert })),
          // select handles two query shapes:
          // 1. existingNarration: .select('id').eq(campaign_id).eq(type).limit(1)
          // 2. historyRows: .select('content,...').eq(campaign_id).in(type,[]).eq(processed).order()
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn(() => ({ data: [{ id: 'narration-1' }], error: null })),
              })),
              in: vi.fn(() => ({
                eq: vi.fn(() => ({
                  order: vi.fn(() => mockMessagesSelect()),
                })),
              })),
            })),
          })),
        }
      }
      if (table === 'worlds') {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: mockWorldSelect })) })) }
      }
      if (table === 'players') {
        // handles both .eq() (main player list) and .in() (playerNameRows)
        return { select: vi.fn(() => ({ eq: vi.fn(() => mockPlayersSelect()), in: vi.fn(() => mockPlayersSelect()) })) }
      }
      return {}
    },
  })),
}))

vi.mock('@/lib/realtime-broadcast', () => ({
  broadcastGameEvent: mockBroadcastGameEvent,
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function MockAnthropic() {
    return { messages: { stream: mockAnthropicStream } }
  }),
}))

vi.mock('@/lib/game-session/prompt', () => ({
  buildGMSystemPrompt: vi.fn(() => 'system-prompt'),
  isFirstCallResponse: vi.fn((r: unknown) => {
    return typeof r === 'object' && r !== null && 'world_context' in r
  }),
  buildFirstCallInput: vi.fn(() => 'first-call-input'),
}))

vi.mock('@/lib/game-session/history', () => ({
  buildMessageHistory: vi.fn(() => []),
}))

describe('POST /api/game-session/[id]/round', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBroadcastGameEvent.mockResolvedValue(undefined)
    mockMessagesInsert.mockResolvedValue({ data: [{ id: 'narration-1', campaign_id: 'campaign-1', player_id: null, content: 'The sword strikes!', type: 'narration', processed: true, created_at: new Date().toISOString() }], error: null })
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  })

  it('returns 401 without service role key', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-key' },
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'campaign-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 409 when lock cannot be acquired', async () => {
    mockCampaignUpdate.mockResolvedValue({ data: [], error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-service-role-key' },
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'campaign-1' }) })
    expect(res.status).toBe(409)
  })

  it('broadcasts round:started and round:saved on success', async () => {
    // Lock acquired
    mockCampaignUpdate.mockResolvedValue({ data: [{ id: 'campaign-1' }], error: null })

    // Campaign data
    mockCampaignSelect.mockResolvedValue({
      data: { world_id: 'world-1', next_round_at: new Date(Date.now() - 5000).toISOString() },
      error: null,
    })

    // Claimed actions
    mockMessagesUpdate.mockResolvedValue({
      data: [{ id: 'msg-1', player_id: 'player-1', content: 'I attack', client_id: null }],
      error: null,
    })

    // History
    mockMessagesSelect.mockResolvedValue({ data: [], error: null })

    // World
    mockWorldSelect.mockResolvedValue({
      data: { world_content: 'A fantasy world.' },
      error: null,
    })

    // Players
    mockPlayersSelect.mockResolvedValue({
      data: [{ id: 'player-1', character_name: 'Aria', username: null }],
      error: null,
    })

    // Anthropic stream mock: emits one text chunk
    const fakeStream = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'The sword strikes!' } }
      },
    }
    mockAnthropicStream.mockReturnValue(fakeStream)

    const { POST } = await import('../route')
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-service-role-key' },
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'campaign-1' }) })

    expect(res.status).toBe(200)
    expect(mockBroadcastGameEvent).toHaveBeenCalledWith('campaign-1', 'round:started', {})
    expect(mockBroadcastGameEvent).toHaveBeenCalledWith('campaign-1', 'chunk', { content: 'The sword strikes!' })
    expect(mockBroadcastGameEvent).toHaveBeenCalledWith('campaign-1', 'round:saved', {})
  })

  it('broadcasts round:saved and returns skipped when no actions to process', async () => {
    // Lock acquired
    mockCampaignUpdate.mockResolvedValue({ data: [{ id: 'campaign-1' }], error: null })

    // Campaign data — next_round_at in the past so debounce passes
    mockCampaignSelect.mockResolvedValue({
      data: { world_id: 'world-1', next_round_at: new Date(Date.now() - 5000).toISOString() },
      error: null,
    })

    // No claimed actions (empty array)
    mockMessagesUpdate.mockResolvedValue({ data: [], error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-service-role-key' },
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'campaign-1' }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toBe(true)
    // Must broadcast round:saved so clients aren't stuck with roundInProgress=true
    expect(mockBroadcastGameEvent).toHaveBeenCalledWith('campaign-1', 'round:saved', {})
  })
})
