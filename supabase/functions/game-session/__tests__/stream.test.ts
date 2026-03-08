import { describe, it, expect, vi } from 'vitest'

import { consumeStream, type StreamEvent } from '../stream.ts'

async function* makeStream(events: StreamEvent[]): AsyncIterable<StreamEvent> {
  for (const event of events) {
    yield event
  }
}

describe('consumeStream', () => {
  it('broadcasts chunk events when silent is false', async () => {
    const onChunk = vi.fn()
    const onChunkLog = vi.fn()
    const stream = makeStream([
      { type: 'response.output_text.delta', delta: '{"nar' },
      { type: 'response.output_text.delta', delta: 'ration":[]}' },
      { type: 'response.completed', response: { output_text: '{"narration":[]}', id: 'resp_123' } },
    ])

    const result = await consumeStream('campaign-1', stream, onChunk, onChunkLog, false)

    expect(onChunk).toHaveBeenCalledTimes(2)
    expect(onChunk).toHaveBeenNthCalledWith(1, 'campaign-1', '{"nar')
    expect(onChunk).toHaveBeenNthCalledWith(2, 'campaign-1', 'ration":[]}')
    expect(result).toEqual({ fullText: '{"narration":[]}', newResponseId: 'resp_123' })
  })

  it('falls back to accumulated delta text when response.completed has no output_text', async () => {
    const onChunk = vi.fn()
    const onChunkLog = vi.fn()
    const stream = makeStream([
      { type: 'response.output_text.delta', delta: '{"narration":["hello"]}' },
      { type: 'response.completed', response: { output_text: undefined, id: 'resp_789' } },
    ])

    const result = await consumeStream('campaign-3', stream, onChunk, onChunkLog, false)

    expect(result).toEqual({ fullText: '{"narration":["hello"]}', newResponseId: 'resp_789' })
  })

  it('suppresses chunk broadcasts when silent is true', async () => {
    const onChunk = vi.fn()
    const onChunkLog = vi.fn()
    const stream = makeStream([
      { type: 'response.output_text.delta', delta: '{"world_context":"x"' },
      { type: 'response.output_text.delta', delta: ',"narration":[]}' },
      { type: 'response.completed', response: { output_text: '{"world_context":"x","narration":[]}', id: 'resp_456' } },
    ])

    const result = await consumeStream('campaign-2', stream, onChunk, onChunkLog, true)

    expect(onChunk).not.toHaveBeenCalled()
    expect(result).toEqual({ fullText: '{"world_context":"x","narration":[]}', newResponseId: 'resp_456' })
  })
})
