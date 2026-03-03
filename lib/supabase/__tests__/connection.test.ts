import { describe, it, expect } from 'vitest'

describe('Supabase client', () => {
  it('createClient is a function', async () => {
    const { createClient } = await import('../client')
    expect(typeof createClient).toBe('function')
  })

  it('createServerSupabaseClient is a function', async () => {
    const { createServerSupabaseClient } = await import('../server')
    expect(typeof createServerSupabaseClient).toBe('function')
  })
})
