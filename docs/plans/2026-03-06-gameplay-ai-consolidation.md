# Gameplay AI Consolidation

**Date:** 2026-03-06
**Status:** Approved
**Branch:** `feature/gameplay`

---

## Overview

Consolidate and simplify the AI call architecture across the app. The goals are:

1. Faster world generation — remove sections that are only useful at game time
2. Eliminate the `start-campaign` edge function entirely
3. Move world depth generation (History, Factions, Tone) and opening scene into the first `game-session` OpenAI call
4. Improve the GM system prompt with engagement, pacing, and player placement rules
5. Update the campaign cover image to focus on characters

---

## Changes by Component

### 1. `generate-world` edge function

Remove History, Factions, and Tone from the Claude system prompt.

**Keeps:** World Name, Classes (6), Overview, Geography
**Removes:** History, Factions, Tone

World generation becomes faster and the output leaner. History/Factions/Tone are only needed by the GM at game time — they do not appear in any UI before the game starts.

---

### 2. `start-campaign` edge function — deleted

The edge function is removed entirely. Its two responsibilities are redistributed:

- Claude call (opening_situation + starting_hooks) → moved into `game-session` first call
- Campaign cover image trigger → moved into the Next.js start route

---

### 3. Next.js route `POST /api/campaign/[id]/start`

Remove the call to the `start-campaign` edge function. Add a fire-and-forget trigger to `generate-image` for the campaign cover image in its place.

```
1. Validate host + all players ready
2. Broadcast game:starting
3. [NEW] Fire-and-forget: POST /functions/v1/generate-image
         { entity_type: 'campaign', entity_id, image_type: 'cover' }
4. Return 200
```

---

### 4. `generate-image` — campaign cover prompt

Update the campaign cover image to focus on the characters as distinct individuals.

**Current:** Party shown as silhouettes or mid-ground figures.

**New `SCENE_IMAGE_SYSTEM_PROMPT`:**
```
You are a tabletop RPG character art generator. Generate a single widescreen (16:9 landscape)
cinematic scene that will be used as a full-bleed UI background for a web application.

CRITICAL COMPOSITION RULES:
- Fill the entire frame with rich atmospheric scene content — no large empty or black areas
- Depict each character as a distinct individual, visible and recognizable in the scene
- Show their class, equipment, and personality through their appearance and posture
- The LEFT third should have the primary focal point
- Add a subtle dark vignette along the bottom edge for UI text readability

VISUAL RULES:
- Do NOT include any text, titles, logos, labels, or typographic elements
- Use deep, rich atmospheric lighting with dramatic shadows
- Genre must be faithfully rendered: crime gets gritty urban realism, sci-fi gets cold tech
  aesthetics, fantasy gets painterly drama, horror gets dark texture
- Each character must feel unique and specific to their class and backstory

Output only the image.
```

Also fetch `character_backstory` in the `buildPrompt` function for campaign entity, and include it in the user prompt:

```
World: {world.name}

{world.world_content}

Characters:
- {character_name} ({character_class}): {character_backstory}
- ...
```

---

### 5. Database migration

Drop columns that are no longer written to:

```sql
ALTER TABLE campaigns
  DROP COLUMN opening_situation,
  DROP COLUMN starting_hooks;
```

---

### 6. `game-session` — first call schema

The first OpenAI call generates world depth + opening scene + opening narration in a single pass.

**System prompt input:** Name, Classes, Overview, Geography + player characters + GM rules (see section 7)

**First call input:**
```
Generate this world's History, Factions, and Tone. Then establish the opening situation
and starting hooks for this campaign. Then narrate the opening scene.
```

**First call response schema:**
```json
{
  "world_context": {
    "history": "string",
    "factions": "string",
    "tone": "string"
  },
  "opening_situation": "string",
  "starting_hooks": ["string", "string", "string"],
  "actions": [],
  "narration": ["string"]
}
```

- `world_context`, `opening_situation`, `starting_hooks` — server reads, does NOT broadcast to clients. These stay in the conversation chain via `previous_response_id` for the GM's ongoing context.
- `narration` — broadcast to clients as the opening scene.
- `actions` — always empty on the first call (no player actions yet).

**Subsequent calls** use the existing schema unchanged:
```json
{
  "actions": [{ "clientId": "string", "playerName": "string", "content": "string" }],
  "narration": ["string"]
}
```

---

### 7. GM System Prompt

Built once in `game-session` from: world content (Name, Classes, Overview, Geography) + player characters. Sent as `instructions` on the first OpenAI call only.

```
<role>
You are the Game Master for a tabletop RPG campaign. Narrate the story in second person,
immersive prose. React to all player actions collectively. Detect the language used in
the world description and write all narration entirely in that language.
</role>

<world>
{world.world_content}
</world>

<player-characters>
{players formatted as: "- Name (Class): Backstory"}
</player-characters>

<narration-rules>
- Address all player actions in each narration. No player is ignored.
- Keep narrations between 3-6 paragraphs. Vivid but not exhausting.
- End each narration with a clear situation: what the players see, hear, or face next.
- If a player's action is impossible or fails, narrate the failure dramatically.
- Never break character. Never acknowledge you are an AI.

Player placement: Players may begin together, in small groups, or alone — honor the
opening situation exactly. When players are split, narrate each group's location and
immediate reality. Bring them together only when the story earns it.

Opening narration: The first narration must establish the world vividly — atmosphere,
place, what is at stake — and make each player's position and situation immediately clear.
Do not waste the opening on generic scene-setting.

Story hooks: The starting hooks are the spine of this campaign. Reference them, develop
them, escalate them. Every 2-3 narrations, at least one hook should be visibly in motion —
named, felt, or pressing closer.

World texture: Weave world-specific details (locations, factions, creatures, history) into
every narration. The world should feel alive and specific, not generic.

Pacing: This campaign is meant to be short and intense. Drive toward meaningful moments —
confrontations, revelations, decisions. Avoid filler. If the players stall, a hook tightens.
</narration-rules>

<mechanics-rules>
- HP is tracked on a 0-20 scale.
- D20 rolls determine success on contested or risky actions.
- Describe dice outcomes narratively — never expose raw numbers.
</mechanics-rules>

<output-format>
Every response must be a JSON object. No markdown fences, no text outside the JSON.

First response schema:
{
  "world_context": { "history": "string", "factions": "string", "tone": "string" },
  "opening_situation": "string",
  "starting_hooks": ["string", "string", "string"],
  "actions": [],
  "narration": ["string"]
}

All subsequent responses:
{
  "actions": [{ "clientId": "string", "playerName": "string", "content": "string" }],
  "narration": ["string"]
}
</output-format>
```

---

## Files to Create or Modify

| File | Change |
|------|--------|
| `supabase/functions/generate-world/index.ts` | **Modify** — remove History, Factions, Tone from Claude system prompt |
| `supabase/functions/start-campaign/index.ts` | **Delete** |
| `app/api/campaign/[id]/start/route.ts` | **Modify** — remove start-campaign call, add campaign cover image trigger |
| `supabase/functions/generate-image/index.ts` | **Modify** — update SCENE_IMAGE_SYSTEM_PROMPT, fetch character_backstory |
| `supabase/migrations/YYYYMMDD_drop_opening_situation_starting_hooks.sql` | **New** — drop columns |
| `supabase/functions/game-session/index.ts` | **New** (or **Modify** if already started) — first call schema, GM system prompt |

---

## What Does Not Change

- World cover and map images — still triggered from `generate-world`
- WebSocket protocol and game loop — unchanged
- `previous_response_id` chain — unchanged
- Subsequent round schema — unchanged
