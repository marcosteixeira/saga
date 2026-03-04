import { describe, it, expect } from 'vitest'
import { buildWorldGenPrompt } from '../world-gen'

describe('buildWorldGenPrompt', () => {
  it('does not include Current Situation section', () => {
    const prompt = buildWorldGenPrompt('A dark steampunk world')
    expect(prompt.system).not.toContain('Current Situation')
  })

  it('does not include Starting Hooks section', () => {
    const prompt = buildWorldGenPrompt('A dark steampunk world')
    expect(prompt.system).not.toContain('Starting Hooks')
  })

  it('still includes the 6 core world sections', () => {
    const prompt = buildWorldGenPrompt('A dark steampunk world')
    expect(prompt.system).toContain('## World Name')
    expect(prompt.system).toContain('## Overview')
    expect(prompt.system).toContain('## History')
    expect(prompt.system).toContain('## Geography')
    expect(prompt.system).toContain('## Factions')
    expect(prompt.system).toContain('## Tone')
  })

  it('passes the world description as the user message', () => {
    const desc = 'A sunken city ruled by merfolk'
    const prompt = buildWorldGenPrompt(desc)
    expect(prompt.user).toBe(desc)
  })
})
