import type { Message, Player } from '@/types'

export function buildSessionSummaryPrompt(messages: Message[], players: Player[]): string {
  const characterNames = players
    .filter((p) => p.character_name)
    .map((p) => p.character_name)
    .join(', ')

  const sessionLog = messages
    .map((m) => `[${m.type}] ${m.content}`)
    .join('\n')

  return `You are a skilled fantasy author writing a narrative prose summary of a tabletop RPG session.

Write a 400-600 word narrative summary of the session below. Requirements:
- Past tense, third person perspective
- Prose style — no bullet points, no game mechanics (do not mention dice rolls, HP numbers, or stats)
- Cover key events, player actions, NPC interactions, and combat outcomes
- Mention all player characters by name throughout the summary
- Dramatic, story-like tone that reads like a chapter recap from a fantasy novel

Player characters in this session: ${characterNames || '(none listed)'}

Session log:
${sessionLog || '(no messages recorded)'}

Write the narrative summary now:`
}
