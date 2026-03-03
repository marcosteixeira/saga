# Saga — Validated Design Document

_Created: 2026-03-03 | Brainstormed with Claude_

---

## Vision

A web platform where 1-6 players play tabletop RPG in real-time with an AI Game Master. The AI narrates the story, arbitrates rules (d20-based), generates scene and character images, and maintains persistent memory across sessions. Players join via a shared link — no registration required.

**Goal**: Playable demo that is visually impressive, with strong AI memory and image generation.

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Authentication | None — username-only for everyone, session token in localStorage | Zero friction, fastest to build |
| Text AI (GM) | Claude Sonnet 4.6 (Anthropic) | Best creative writing and roleplay quality |
| Image AI | Gemini Nano Banana Pro (`gemini-3-pro-image-preview`) | High-quality image generation, 4K support |
| RPG system | d20 rolls by default, host can override with plain text | Simple, flexible, zero UI complexity |
| Turn modes | Free + sequential (combat) | Covers exploration and combat |
| Stats | HP only (20 max). 0 = incapacitated, massive damage = dead | Simplest system with real stakes |
| Streaming | Supabase Realtime broadcast | Uses existing infra, avoids Vercel timeout limits |
| UI theme | Dark fantasy (dark backgrounds, gold/amber accents) | Immersive, fits the RPG genre |
| Database | Supabase (Postgres + Realtime) | DB + realtime + storage in one |
| Framework | Next.js 14 (App Router) + TypeScript | Full-stack, easy deploy |
| UI library | shadcn/ui + Tailwind CSS | Fast development, customizable, dark mode built-in |
| Deploy | Vercel | Zero config with Next.js |
| Max players | 6 per campaign | Mirrors a real tabletop group |
| Turn timer | 60s default (free mode) | Keeps game moving |
| Scene images | Only when AI tags GENERATE_IMAGE | Controlled cost |
| Memory system | Multi-file MD (WORLD, CHARACTERS, NPCS, LOCATIONS, MEMORY) | Human-readable, organized, flexible |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend + API | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Supabase (Postgres) |
| Realtime | Supabase Realtime (broadcast channels) |
| AI — GM | Claude Sonnet 4.6 (Anthropic SDK) |
| AI — Images | Gemini Nano Banana Pro (`gemini-3-pro-image-preview`) |
| Deploy | Vercel |

---

## Database Schema

```sql
-- Campaigns
CREATE TABLE campaigns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  host_username       TEXT NOT NULL,
  host_session_token  UUID NOT NULL,
  world_description   TEXT NOT NULL,
  system_description  TEXT,
  cover_image_url     TEXT,
  map_image_url       TEXT,
  status              TEXT DEFAULT 'lobby',     -- lobby | active | paused | ended
  turn_mode           TEXT DEFAULT 'free',      -- free | sequential
  turn_timer_seconds  INT DEFAULT 60,
  current_session_id  UUID,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Players
CREATE TABLE players (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  session_token         UUID NOT NULL,
  username              TEXT NOT NULL,
  character_name        TEXT,
  character_class       TEXT,
  character_backstory   TEXT,
  character_image_url   TEXT,
  stats                 JSONB DEFAULT '{"hp": 20, "hp_max": 20}',
  status                TEXT DEFAULT 'active',   -- active | dead | incapacitated | absent
  absence_mode          TEXT DEFAULT 'skip',     -- skip | npc | auto_act
  is_host               BOOLEAN DEFAULT false,
  last_seen_at          TIMESTAMPTZ DEFAULT now(),
  joined_at             TIMESTAMPTZ DEFAULT now()
);

-- Messages (game log)
CREATE TABLE messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  session_id    UUID REFERENCES sessions(id),
  player_id     UUID REFERENCES players(id),   -- null = AI (GM)
  content       TEXT NOT NULL,
  image_url     TEXT,
  type          TEXT NOT NULL,                  -- action | narration | system | ooc
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Campaign Memory Files
CREATE TABLE campaign_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  content       TEXT NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (campaign_id, filename)
);

-- Sessions
CREATE TABLE sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  session_number      INT NOT NULL,
  present_player_ids  UUID[] DEFAULT '{}',
  summary_md          TEXT,
  started_at          TIMESTAMPTZ DEFAULT now(),
  ended_at            TIMESTAMPTZ
);
```

---

## Architecture

### High-level

```
Browser (Next.js)  <-->  Next.js API Routes (Vercel)  <-->  Supabase (Postgres + Realtime)
                                    |
                           +--------+--------+
                           |                 |
                    Claude Sonnet 4.6   Gemini Nano Banana Pro
                    (narration/text)    (images)
```

### Streaming Architecture

AI narration reaches all players in real-time via Supabase broadcast:

```
Claude Sonnet 4.6 stream → Next.js API route (server)
  → Buffer tokens (~100ms batches)
  → Supabase Realtime broadcast to channel: campaign:[id]:narration
  → All subscribed clients receive chunks
  → Client appends chunks to UI in real-time
  → On stream end: save full message to DB, trigger memory update
```

---

## Core Data Flows

### 1. Campaign Creation

```
Host fills form → POST /api/campaign
  → Insert campaign row (status: lobby)
  → Claude: generate WORLD.md from world_description
  → Gemini: generate cover image + world map (parallel)
  → Save files to campaign_files + image URLs to campaign
  → Return campaign ID → redirect to /campaign/[id]/lobby
```

### 2. Player Joins

```
Player opens /campaign/[id] → redirected to /lobby if status=lobby
  → Enter username + character details
  → POST /api/campaign/[id]/join
    → Insert player row (stats: {hp: 20, hp_max: 20})
    → Gemini: generate character portrait (background)
  → Supabase Realtime: other players see new join
```

### 3. Game Loop (Free Mode)

```
AI sends opening narration:
  → Server calls Claude with streaming
  → Tokens batched and broadcast via Supabase Realtime
  → All players see narration appear live
  → Full narration saved to messages table
  → MEMORY_UPDATE parsed → campaign_files updated
  → If GENERATE_IMAGE found → Gemini generates scene image (background)

Players submit actions:
  → Each player types action → POST /api/campaign/[id]/message (type: action)
  → Action saved to messages, broadcast via Realtime
  → When all active players submitted OR timer expires → trigger AI narration
```

### 4. Game Loop (Sequential Mode — Combat)

```
AI specifies turn order in narration
  → Server tracks whose turn it is
  → Only active player's input is enabled
  → After each player submits → next player activated
  → After all players → AI narrates combined outcome
```

### 5. End Session

```
Host clicks "End Session" → POST /api/session/end
  → Claude: generate session summary from all session messages
  → Save to sessions.summary_md + campaign_files (session-XX.md)
  → Compact MEMORY.md for next session
  → Set campaign.status = 'paused'
```

---

## RPG System

**Default**: d20 rolls for uncertain outcomes. GM decides when to call for a roll and sets the difficulty.

- All characters start at 20 HP
- GM narrates damage and healing, includes HP updates in MEMORY_UPDATE
- At 0 HP → status = `incapacitated` (can be healed by party)
- Massive damage → status = `dead`
- Host can override with custom rules via `system_description` (plain text)

---

## AI Memory System

Each campaign has a virtual file system stored as rows in `campaign_files`:

| File | Purpose | Injected into prompt? |
|---|---|---|
| `WORLD.md` | World lore, geography, factions, tone | Yes |
| `CHARACTERS.md` | Player characters: name, class, backstory, HP, inventory | Yes |
| `NPCS.md` | Named NPCs: personality, disposition, location, status | Yes |
| `LOCATIONS.md` | Visited locations: description, events, current state | Yes |
| `MEMORY.md` | Executive summary (~500 words): current quest, recent events, threats | Yes (every prompt) |
| `session-XX.md` | Full narrative summary per session | No (archived) |

### Memory Update Protocol

After each narration, the AI appends a structured JSON block:

```json
{
  "npcs": [{"name": "...", "status": "...", "disposition": "...", "note": "..."}],
  "locations": [{"name": "...", "status": "...", "note": "..."}],
  "character_updates": [{"name": "...", "hp": 15, "note": "Took 5 damage from goblin"}],
  "events": ["Party discovered the hidden passage"],
  "memory_md": "Rewritten MEMORY.md content (max 500 words, present tense)"
}
```

The backend parses this block, updates the relevant MD files, and saves updated stats to the players table.

---

## AI Prompts

### GM System Prompt

```
You are an experienced, creative, and fair Game Master running a tabletop RPG.

<narration-rules>
- Narrate in second-person plural when addressing the group ("You enter the tavern...")
- Be vivid and dramatic in descriptions; be fair and consistent in consequences
- Keep narrations focused: 2-4 paragraphs per scene
- Let players make meaningful choices. Don't railroad.
- When a named NPC appears for the first time, give a brief physical description.
</narration-rules>

<mechanics-rules>
- Characters have HP (max 20). Track damage and healing.
- When a player attempts something with uncertain outcome, call for a d20 roll and state the difficulty (e.g., "Roll a d20. You need 12 or higher.")
- At 0 HP a character is incapacitated. Massive damage kills.
- Be consistent with what has been established.
{system_description if provided}
</mechanics-rules>

<memory-rules>
- After each narration, append a MEMORY_UPDATE block (JSON) with changes to NPCs, locations, characters (including HP changes), or key events.
- If a scene image should be generated, append: GENERATE_IMAGE: <detailed description>
- Keep MEMORY_UPDATE precise and brief.
</memory-rules>

<world>
{WORLD.md}
</world>

<player-characters>
{CHARACTERS.md}
</player-characters>

<known-npcs>
{NPCS.md}
</known-npcs>

<campaign-summary>
{MEMORY.md}
</campaign-summary>
```

### World Generation Prompt

Generates WORLD.md from the host's description. Includes: world name, overview, history, geography, factions, tone, current situation, and starting hooks.

### Session Summary Prompt

Generates a 400-600 word narrative prose summary (past tense, third person) of the session.

---

## Player States

| Status | Description | Turn Behavior |
|---|---|---|
| `active` | Normal, playing | Receives their turn |
| `dead` | Character has died | Skipped, becomes spectator |
| `incapacitated` | Unconscious (0 HP) | Skipped, AI narrates condition |
| `absent` | Player disconnected | Behavior defined by absence_mode |

### Absence Modes

| Mode | Behavior |
|---|---|
| `skip` | Character "stays behind", removed from turn order |
| `npc` | AI controls the character in-character |
| `auto_act` | AI suggests action, host approves before submitting |

---

## UI Design

### Theme: Dark Fantasy

- Dark backgrounds (#0a0a0a to #1a1a2e)
- Gold/amber accents (#d4a574, #c9a55a)
- Parchment-toned text for narration
- Medieval-inspired typography (serif for narration, sans-serif for UI)
- Subtle textures and gradients
- Scene images displayed prominently

### Pages

**`/` — Landing**
- Hero with dark fantasy art
- "Create Campaign" CTA
- "Join Campaign" link input

**`/campaign/new` — Create Campaign**
- Form: name, world description, system description (optional)
- Loading state during AI generation
- Preview: WORLD.md, cover art, world map
- "Start Campaign" button

**`/campaign/[id]/lobby` — Lobby**
- Campaign info: name, cover, world summary
- Live player list (Supabase Realtime)
- Character creation: name, class, backstory → portrait generated
- Share link displayed prominently
- Host: "Start Session" button

**`/campaign/[id]` — Game Room**
- Left sidebar: PlayerList (portraits, HP bars, status)
- Center: MessageFeed (narration streaming, player actions, scene images)
- Bottom: ActionInput (text + submit, timer bar, turn indicator)
- Right/top: SceneImage (current scene, collapsible)

**`/campaign/[id]/summary` — Session Summary**
- Prose narrative
- "Continue Campaign" / "End Campaign"

---

## Project Structure

```
saga/
├── app/
│   ├── page.tsx                           # Landing page
│   ├── layout.tsx                         # Root layout (dark theme, fonts)
│   ├── campaign/
│   │   ├── new/
│   │   │   └── page.tsx                   # Campaign creation form
│   │   └── [id]/
│   │       ├── page.tsx                   # Game room
│   │       ├── lobby/
│   │       │   └── page.tsx               # Lobby / character creation
│   │       └── summary/
│   │           └── page.tsx               # Session summary
│   └── api/
│       └── campaign/
│           ├── route.ts                   # POST: create campaign + generate world
│           └── [id]/
│               ├── route.ts               # GET: fetch campaign data
│               ├── join/route.ts          # POST: join campaign (create player)
│               ├── message/route.ts       # POST: submit action
│               ├── narrate/route.ts       # POST: trigger AI narration (streaming)
│               ├── image/route.ts         # POST: generate scene/character image
│               └── session/
│                   ├── start/route.ts     # POST: start session
│                   └── end/route.ts       # POST: end session + summary
│
├── lib/
│   ├── anthropic.ts                       # Anthropic client setup
│   ├── gemini.ts                          # Gemini client setup
│   ├── supabase/
│   │   ├── server.ts                      # Supabase server client
│   │   └── client.ts                      # Supabase browser client
│   ├── memory.ts                          # Read/write/update campaign MD files
│   ├── turns.ts                           # Turn logic + timer
│   └── prompts/
│       ├── gm-system.ts                   # GM system prompt builder
│       ├── world-gen.ts                   # World generation prompt
│       ├── memory-update.ts               # Memory extraction (fallback)
│       └── session-summary.ts             # End-of-session summary prompt
│
├── components/
│   ├── ui/                                # shadcn/ui components
│   ├── game/
│   │   ├── MessageFeed.tsx
│   │   ├── ActionInput.tsx
│   │   ├── PlayerList.tsx
│   │   ├── SceneImage.tsx
│   │   ├── TurnIndicator.tsx
│   │   └── GameRoom.tsx
│   ├── campaign/
│   │   ├── WorldGenForm.tsx
│   │   ├── WorldPreview.tsx
│   │   └── CharacterCreation.tsx
│   └── shared/
│       ├── HPBar.tsx
│       └── DarkFantasyLayout.tsx
│
├── types/
│   └── index.ts
│
├── supabase/
│   └── migrations/
│       └── 001_initial.sql
│
├── public/
└── .env.local
```

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
```

---

## Scope — MVP Features

- Create campaign with AI-generated world lore, cover art, and world map
- Share campaign via link (no login)
- 1-6 players join and create characters with AI-generated portraits
- Real-time game loop: player actions → AI narration → everyone sees it live
- Token-by-token streaming narration via Supabase broadcast
- d20 dice system with HP tracking
- Free mode (everyone acts) + sequential mode (combat turns)
- AI memory system: WORLD.md, CHARACTERS.md, NPCS.md, LOCATIONS.md, MEMORY.md
- Scene image generation when AI tags GENERATE_IMAGE
- Session management: start, play, end with summary generation
- Dark fantasy themed UI
- Deploy on Vercel

## Explicitly Out of Scope (Future)

- Authentication (magic links, OAuth)
- Voice narration (ElevenLabs)
- AI players
- Messaging platform integration (Telegram, WhatsApp)
- RAG / semantic search
- Campaign export
- Interactive maps
- Preset system templates
- Mobile-optimized UI
