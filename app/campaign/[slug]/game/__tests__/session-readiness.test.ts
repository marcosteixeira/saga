import { describe, expect, it, vi } from 'vitest'
import { fetchSessionOpeningReady } from '@/app/campaign/[slug]/game/session-readiness'

describe('fetchSessionOpeningReady', () => {
  it('returns true when session opening_situation exists', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { opening_situation: 'You arrive at dawn.' },
      error: null,
    })
    const eqSession = vi.fn().mockReturnValue({ maybeSingle })
    const eqCampaign = vi.fn().mockReturnValue({ eq: eqSession })
    const select = vi.fn().mockReturnValue({ eq: eqCampaign })
    const from = vi.fn().mockReturnValue({ select })

    const ready = await fetchSessionOpeningReady({ from }, 'camp-1')

    expect(ready).toBe(true)
    expect(from).toHaveBeenCalledWith('sessions')
    expect(select).toHaveBeenCalledWith('opening_situation')
    expect(eqCampaign).toHaveBeenCalledWith('campaign_id', 'camp-1')
    expect(eqSession).toHaveBeenCalledWith('session_number', 1)
  })

  it('returns false when query errors', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    })
    const eqSession = vi.fn().mockReturnValue({ maybeSingle })
    const eqCampaign = vi.fn().mockReturnValue({ eq: eqSession })
    const select = vi.fn().mockReturnValue({ eq: eqCampaign })
    const from = vi.fn().mockReturnValue({ select })

    const ready = await fetchSessionOpeningReady({ from }, 'camp-1')

    expect(ready).toBe(false)
  })
})
