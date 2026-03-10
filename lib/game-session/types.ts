// lib/game-session/types.ts

export interface MsgRow {
  content: string
  type: 'action' | 'narration'
  players: { character_name: string | null; username: string | null } | null
}

// buildMessageHistory always returns string content.
// The round route applies cache_control inline on the last message before sending to Anthropic.
export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface FirstCallResponse {
  world_context: { history: string; factions: string; tone: string }
  opening_situation: string
  starting_hooks: string[]
  actions: []
  narration: string[]
}

export interface RoundResponse {
  actions: Array<{ clientId: string; playerName: string; content: string }>
  narration: string[]
}

export type GMResponse = FirstCallResponse | RoundResponse
