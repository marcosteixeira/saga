# World Classes Design

**Date:** 2026-03-04

## Goal

Generate 6 world-specific character classes during world creation and present them as the only selectable options during character creation in the lobby.

## Data Model

Add a `classes JSONB` column to the `worlds` table:

```sql
ALTER TABLE worlds ADD COLUMN classes JSONB DEFAULT '[]';
```

Each entry shape:
```json
{ "name": "Shadow Warden", "description": "Protectors of the veil between life and death." }
```

`players.character_class` stays as `TEXT` — stores the chosen class name. No change.

## AI Generation

Extend the existing `generate-world` Edge Function prompt to include a `## Classes` section at the end of the returned Markdown:

````markdown
## Classes
```json
[
  { "name": "...", "description": "..." },
  ...
]
```
````

- Always exactly 6 classes
- Classes are thematically derived from the world's lore, factions, and tone
- After generation, the Edge Function parses and strips the JSON block from `world_content`, saving it to `worlds.classes`
- Retry validation checks for: `## Classes` section present, valid JSON, exactly 6 entries with `name` and `description`

## Character Creation Integration

- `GET /api/campaign/[id]` already joins world — no new endpoints needed
- Lobby character creation form renders a dropdown/radio group from `world.classes`
- Each option shows class name + description
- Selected class name saved to `players.character_class`

## Decisions

- Fixed count: always 6 classes (not 4–6)
- No icons for now
- Classes are world-scoped, not reusable across worlds
- Storage: JSONB on worlds (not a separate table) — classes are always read with the world, never queried in isolation
