import { vi } from 'vitest'

export default class Anthropic {
  messages = {
    stream: vi.fn(),
  }
  constructor(_opts?: unknown) {}
}
