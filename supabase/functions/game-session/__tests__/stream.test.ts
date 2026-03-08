import { describe, it, expect, vi } from 'vitest'
import { consumeStream, type StreamEvent } from '../stream.ts'

async function* makeStream(events: StreamEvent[]): AsyncIterable<StreamEvent> {
  for (const event of events) {
    yield event
  }
}

describe('consumeStream', () => {
  it('broadcasts text chunks from content_block_delta events', async () => {
    const onChunk = vi.fn()
    const onChunkLog = vi.fn()
    const stream = makeStream([
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'The tavern' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: ' fills with smoke.' } },
      { type: 'message_stop' },
    ])

    const result = await consumeStream('campaign-1', stream, onChunk, onChunkLog, false)

    expect(onChunk).toHaveBeenCalledTimes(2)
    expect(onChunk).toHaveBeenNthCalledWith(1, 'campaign-1', 'The tavern')
    expect(onChunk).toHaveBeenNthCalledWith(2, 'campaign-1', ' fills with smoke.')
    expect(result).toEqual({ fullText: 'The tavern fills with smoke.' })
  })

  it('suppresses chunk broadcasts when silent is true', async () => {
    const onChunk = vi.fn()
    const onChunkLog = vi.fn()
    const stream = makeStream([
      { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"world_context":' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: '"x"}' } },
      { type: 'message_stop' },
    ])

    const result = await consumeStream('campaign-2', stream, onChunk, onChunkLog, true)

    expect(onChunk).not.toHaveBeenCalled()
    expect(result).toEqual({ fullText: '{"world_context":"x"}' })
  })

  it('ignores non-text delta events', async () => {
    const onChunk = vi.fn()
    const onChunkLog = vi.fn()
    const stream = makeStream([
      { type: 'message_start' },
      { type: 'content_block_start' },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello.' } },
      { type: 'ping' },
      { type: 'content_block_stop' },
      { type: 'message_stop' },
    ])

    const result = await consumeStream('campaign-3', stream, onChunk, onChunkLog, false)

    expect(onChunk).toHaveBeenCalledTimes(1)
    expect(result.fullText).toBe('Hello.')
  })
})
