import { describe, expect, it, vi, afterEach } from 'vitest'
import { logInfo, logError } from '../logging'

describe('generate-world structured logging', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emits structured info logs with event and metadata', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    logInfo('generate_world.request_received', {
      campaignId: 'campaign-1',
      requestId: 'request-1',
    })

    expect(logSpy).toHaveBeenCalledTimes(1)

    const [raw] = logSpy.mock.calls[0]
    const payload = JSON.parse(String(raw))
    expect(payload).toMatchObject({
      level: 'info',
      event: 'generate_world.request_received',
      campaignId: 'campaign-1',
      requestId: 'request-1',
    })
  })

  it('emits structured error logs with normalized error fields', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    logError(
      'generate_world.failed',
      { campaignId: 'campaign-1' },
      new Error('model timeout'),
    )

    expect(errorSpy).toHaveBeenCalledTimes(1)

    const [raw] = errorSpy.mock.calls[0]
    const payload = JSON.parse(String(raw))
    expect(payload).toMatchObject({
      level: 'error',
      event: 'generate_world.failed',
      campaignId: 'campaign-1',
      error: {
        name: 'Error',
        message: 'model timeout',
      },
    })
  })
})
