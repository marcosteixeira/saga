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
## Current Situation
## Starting Hooks

Be evocative and specific. Starting Hooks must list 2-3 adventure hooks players can immediately pursue. Output ONLY the Markdown document, no preamble.`,
    user: worldDescription,
  }
}
