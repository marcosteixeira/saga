export function buildWorldGenPrompt(worldDescription: string): string {
  return `You are a fantasy world-builder. Based on the description below, generate a rich WORLD.md document for a tabletop RPG campaign.

User's world description:
"${worldDescription}"

Output a Markdown document with exactly these sections (use ## headings):
## World Name
## Overview
## History
## Geography
## Factions
## Tone
## Current Situation
## Starting Hooks

Be evocative and specific. Starting Hooks must list 2-3 adventure hooks players can immediately pursue. Output ONLY the Markdown document, no preamble.`
}
