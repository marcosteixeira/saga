export interface WorldGenPrompt {
  system: string
  user: string
}

export function buildWorldGenPrompt(worldDescription: string): WorldGenPrompt {
  return {
    system: `You are a fantasy world-builder. Generate a rich WORLD.md document for a tabletop RPG campaign based on the player's description.

Output a Markdown document with exactly these sections (use ## headings):
## World Name
## Overview
## History
## Geography
## Factions
## Tone

Be evocative and specific. Output ONLY the Markdown document, no preamble.`,
    user: worldDescription,
  }
}
