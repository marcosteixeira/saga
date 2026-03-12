# Saga — Design Document

_Created: 2026-03-03 | Last updated: 2026-03-12_

---

## Vision

A web platform where 1-6 players play tabletop RPG in real-time with an AI Game Master. The AI narrates the story, arbitrates rules (d20-based), generates scene and character images, and maintains persistent memory across sessions. Players join via a shared link.

**Goal**: Playable demo that is visually impressive, with strong AI memory and image generation.

---

## Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Authentication | Supabase Auth (magic link / OAuth) | Added after MVP to support persistent player accounts |
| Text AI (GM) | Claude Sonnet 4.6 (Anthropic) | Best creative writing and roleplay quality |
| Text AI (World gen) | Claude Haiku 4.5 (Anthropic) | Lighter model for structured generation tasks |
| Image AI | Gemini (`gemini-3-pro-image-preview`) | High-quality image generation |
| RPG system | d20 rolls by default, host can override with plain text | Simple, flexible, zero UI complexity |
| Turn modes | Free + sequential (combat) | Covers exploration and combat |
| Stats | HP only (20 max). 0 = incapacitated, massive damage = dead | Simplest system with real stakes |
| Game session transport | REST API (Next.js) + Supabase Realtime broadcast | Replaced Supabase Edge Function WebSocket — eliminated 1006 disconnects and CPU timeouts |
| Realtime delivery | Supabase broadcast API (not postgres_changes) | Explicit control, no message table noise, lower latency |
| Round scheduling | Vercel `after()` (server-side debounce) | No pg_cron, no persistent connections, no in-memory state |
| World gen trigger | Supabase webhook → Edge Function | Generate world/images asynchronously after campaign creation |
| UI theme | Dark fantasy (dark backgrounds, gold/amber accents) | Immersive, fits the RPG genre |
| Database | Supabase (Postgres + Realtime) | DB + realtime + storage in one |
| Framework | Next.js (App Router) + TypeScript | Full-stack, easy deploy |
| UI library | shadcn/ui + Tailwind CSS | Fast development, customizable, dark mode built-in |
| Deploy | Vercel | Zero config with Next.js |
| Max players | 6 per campaign | Mirrors a real tabletop group |
| Turn timer | 60s default (free mode) | Keeps game moving |
| Scene images | Only when AI tags GENERATE_IMAGE | Controlled cost |
| Memory system | Multi-file MD (WORLD, CHARACTERS, NPCS, LOCATIONS, MEMORY) | Human-readable, organized, flexible |
| Narration dedup | Broadcast paragraphs with DB-assigned IDs | Prevents duplicate messages on reconnect |
| Cover image scope | Campaign-specific cover (separate from world image) | Host can regenerate; world map stays shared |

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend + API | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Supabase (Postgres) |
| Realtime | Supabase Realtime (broadcast channels) |
| Auth | Supabase Auth (magic link / OAuth) |
| AI — GM narration | Claude Sonnet 4.6 (Anthropic) |
| AI — World gen | Claude Haiku 4.5 (Anthropic) |
| AI — Images | Gemini (`gemini-3-pro-image-preview`) |
| Background tasks | Vercel `after()` |
| File storage | Supabase Storage (`campaign-images` bucket) |
| Deploy | Vercel |

---

## Architecture

### High-level

```
Browser (Next.js)  <-->  Next.js API Routes (Vercel)  <-->  Supabase (Postgres + Realtime)
                                    |
                           +--------+--------+
                           |                 |
                    Claude Sonnet 4.6   Gemini
                    (narration)         (images)
                    Claude Haiku 4.5
                    (world gen — Edge Function)
```

### Game Session Architecture

Player actions flow through REST API routes. Real-time events are delivered via Supabase Realtime broadcast. No persistent WebSocket connections.

```
Client ──POST /api/game-session/[id]/action──▶ Next.js API
                                              ├─ Check round_in_progress (409 if running)
                                              ├─ Insert message (processed: false)
                                              ├─ UPDATE next_round_at = NOW() + debounce
                                              ├─ Broadcast 'action' event
                                              └─ after(sleep debounce → POST /round)

POST /api/game-session/[id]/round
  ├─ Acquire round_in_progress lock (CAS update)
  ├─ Self-cancelling debounce: if next_round_at > NOW() → skip (stale worker)
  ├─ Broadcast 'round:started'
  ├─ Atomically claim all unprocessed actions (processed = true)
  ├─ Detect first call (no prior narration) → return JSON schema response
  ├─ Load world + players + history from DB (cache_control on last message)
  ├─ Stream Claude Sonnet → broadcast 'chunk' per token
  ├─ Parse narration → split into paragraphs
  ├─ Save narration rows → broadcast each paragraph with DB id (dedup-safe)
  ├─ Broadcast 'narration' + 'round:saved'
  └─ Release lock, reset next_round_at = NULL
```

Clients subscribe to a single Supabase Realtime broadcast channel: `game:<campaignId>`.

### World Generation Architecture

```
POST /api/campaign
  → Insert campaign row + worlds row (status: pending)
  → Supabase webhook fires generate-world Edge Function
      → Claude Haiku generates WORLD.md (up to 3 retries, validates required sections)
      → Parses + saves world_content + classes JSONB
      → Broadcasts world:started → world:progress → world:complete
      → Triggers generate-image in parallel: cover + map
          → Gemini generates image → uploads to Supabase Storage
          → Broadcasts image:ready on world:<world_id>
```

### Campaign Start Flow

```
POST /api/campaign/[id]/start
  → Validate all players ready
  → Set campaign.status = 'active'
  → Broadcast campaign:started
  → after() → POST /api/game-session/[id]/round  (opening narration)
  → after() → trigger campaign cover image generation
```

---

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Landing: hero, journey steps, AI models overview, "Create Campaign" CTA |
| `/login` | Magic link / OAuth login |
| `/setup` | User profile setup (first login) |
| `/profile` | User dashboard — list of campaigns |
| `/campaign/new` | Create campaign form → world generation |
| `/campaign/[slug]/setup` | World generation status: monitors `world:<id>` broadcast, shows progress, iris reveal animation |
| `/campaign/[slug]/lobby` | Lobby: live player list, character creation, share link, host starts session |
| `/campaign/[slug]/game` | Game room: PlayerList (left), MessageFeed (center), ActionInput (bottom), SceneImage |

---

## API Routes

| Method + Path | Purpose |
| --- | --- |
| `POST /api/campaign` | Create campaign (insert campaign + worlds row) |
| `GET /api/campaign/[id]` | Fetch campaign with world + image URLs |
| `PATCH /api/campaign/[id]` | Update campaign (status, settings) |
| `POST /api/campaign/[id]/start` | Start game session (triggers opening narration + cover image) |
| `POST /api/campaign/[id]/ready` | Mark player as ready |
| `POST /api/campaign/[id]/player` | Save/update player character |
| `POST /api/campaign/[id]/regenerate` | Retry world generation |
| `POST /api/campaign/[id]/reset` | Reset campaign to lobby |
| `GET /api/profile/campaigns` | List user's campaigns |
| `POST /api/game-session/[id]/action` | Submit player action |
| `POST /api/game-session/[id]/round` | Run AI narration round (streaming, called by Vercel `after()`) |
| `GET /auth/callback` | Supabase Auth callback |

---

## Key Files

| File | Purpose |
| --- | --- |
| `app/api/game-session/[id]/action/route.ts` | Player action handler |
| `app/api/game-session/[id]/round/route.ts` | AI round handler (streaming) |
| `app/api/campaign/[id]/start/route.ts` | Campaign start + opening narration trigger |
| `lib/game-session/config.ts` | Shared constants (`ROUND_DEBOUNCE_SECONDS = 8`) |
| `lib/game-session/prompt.ts` | GM system prompt builder |
| `lib/game-session/history.ts` | Conversation history reconstruction from DB messages |
| `lib/game-session/types.ts` | Shared TypeScript types (`MsgRow`, `FirstCallResponse`, etc.) |
| `lib/realtime-broadcast.ts` | Supabase Realtime broadcast helpers |
| `lib/memory.ts` | Campaign memory file read/write helpers (`campaign_files` table) |
| `lib/supabase/server.ts` | Server-side Supabase client (cookie-based auth) |
| `lib/supabase/client.ts` | Browser-side Supabase client |
| `lib/slug.ts` | URL-safe slug generation |
| `lib/seeded-random.ts` | Seeded RNG for reproducible randomness |
| `app/campaign/[slug]/game/GameClient.tsx` | Game room UI + Realtime broadcast client |
| `app/campaign/[slug]/game/MessageBubble.tsx` | Action + narration message display |
| `app/campaign/[slug]/game/ImageModal.tsx` | Full-screen image viewer |
| `app/campaign/[slug]/game/DebounceTimer.tsx` | Visual countdown (mirrors server `ROUND_DEBOUNCE_SECONDS`) |
| `app/campaign/[slug]/game/MobileActionBar.tsx` | Mobile input + action submit |
| `app/campaign/[slug]/lobby/LobbyClient.tsx` | Character selection, portrait gen, readiness |
| `app/campaign/[slug]/setup/page.tsx` | World gen status UI (iris reveal, retry on failure) |
| `supabase/functions/generate-world/` | World gen Edge Function (Claude Haiku) |
| `supabase/functions/generate-image/` | Image gen Edge Function (Gemini) |

---

## Database Schema

Key tables (migrations `001–020` in `supabase/migrations/`):

```sql
-- Campaigns
campaigns (
  id UUID PK,
  name TEXT,
  slug TEXT UNIQUE,
  host_user_id UUID → auth.users,
  world_id UUID → worlds,
  status TEXT,           -- lobby | active | paused | ended
  turn_mode TEXT,        -- free | sequential
  turn_timer_seconds INT DEFAULT 60,
  round_in_progress BOOLEAN DEFAULT false,
  next_round_at TIMESTAMPTZ,  -- self-cancelling debounce (migration 020)
  created_at TIMESTAMPTZ
)

-- Worlds (AI-generated world data)
worlds (
  id UUID PK,
  campaign_id UUID → campaigns,
  world_content TEXT,    -- WORLD.md content
  classes JSONB,         -- available character classes
  status TEXT,           -- pending | generating | done | error
  created_at TIMESTAMPTZ
)

-- Players
players (
  id UUID PK,
  campaign_id UUID → campaigns,
  user_id UUID → auth.users,
  username TEXT,
  character_name TEXT,
  character_class TEXT,
  character_backstory TEXT,
  character_image_url TEXT,
  stats JSONB,           -- { hp: 20, hp_max: 20 }
  status TEXT,           -- active | dead | incapacitated | absent
  absence_mode TEXT,     -- skip | npc | auto_act
  is_host BOOLEAN,
  last_seen_at TIMESTAMPTZ,
  UNIQUE(campaign_id, user_id)
)

-- Messages (game log)
messages (
  id UUID PK,
  campaign_id UUID → campaigns,
  player_id UUID → players,   -- null = AI (GM)
  client_id TEXT,        -- client-generated dedup key
  content TEXT,
  image_url TEXT,
  type TEXT,             -- action | narration | system | ooc
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ
)

-- Campaign memory files
campaign_files (
  id UUID PK,
  campaign_id UUID → campaigns,
  filename TEXT,         -- WORLD.md, MEMORY.md, CHARACTERS.md, etc.
  content TEXT,
  updated_at TIMESTAMPTZ,
  UNIQUE(campaign_id, filename)
)

-- Images
images (
  id UUID PK,
  campaign_id UUID → campaigns,
  type TEXT,             -- cover | map | portrait | scene
  status TEXT,           -- pending | done | error
  storage_path TEXT,
  public_url TEXT,
  created_at TIMESTAMPTZ
)
```

**Messages table is excluded from Supabase Realtime publication** (migration 020). All real-time events use explicit broadcast API calls.

---

## Migrations

| Migration | Key Change |
| --- | --- |
| `001` | Core tables: campaigns, players, worlds, messages, sessions |
| `002` | Add user_id FKs to auth.users |
| `003` | World generation tracking (status, description) |
| `004` | Supabase Storage bucket (`campaign-images`) |
| `005–006` | worlds table: world_content, classes JSONB |
| `007–008` | Sessions: opening content, unique constraint |
| `009` | Campaign slug (unique, URL-safe) |
| `010–012` | Images table; drop URL columns from campaigns/worlds |
| `013` | Drop sessions table; move opening situation to campaigns |
| `014` | last_response_id (OpenAI-era, later dropped) |
| `015` | Additional schema fixes |
| `016` | UNIQUE(campaign_id, user_id) on players |
| `017` | RLS policies on campaign_files, messages, images |
| `018` | Multiplayer coordination: `client_id`, `processed`, `round_in_progress` |
| `019` | Drop last_response_id |
| `020` | `next_round_at TIMESTAMPTZ` on campaigns; remove messages from realtime publication |

---

## Core Data Flows

### 1. Campaign Creation

```
Host fills form → POST /api/campaign
  → Insert campaign + worlds row (status: pending)
  → Supabase webhook → generate-world Edge Function (async)
      → Claude Haiku: generate WORLD.md (up to 3 retries)
      → generate-image: cover + world map (parallel)
  → Client subscribes to world:<world_id> for progress
  → Redirect to /campaign/[slug]/setup (monitors progress)
  → Redirect to /campaign/[slug]/lobby when ready
```

### 2. Player Joins

```
Player opens /campaign/[slug] → lobby if status=lobby
  → Enter username + character details (pick class from worlds.classes)
  → POST /api/campaign/[id]/player
      → Insert/update player row
      → generate-image: character portrait (background)
  → POST /api/campaign/[id]/ready
  → Supabase Realtime: other players see new join
```

### 3. Game Loop (Free Mode)

```
Round triggered (start of session or after player actions):
  POST /api/game-session/[id]/round
    → Acquire round_in_progress lock (CAS)
    → Self-cancelling debounce check (next_round_at)
    → First call: return JSON with opening scene paragraphs
    → Normal: stream Claude Sonnet → broadcast 'chunk' events
    → Save narration paragraphs → broadcast with DB ids
    → Release lock

Player submits action:
  POST /api/game-session/[id]/action
    → 409 if round_in_progress (action dropped, client shows notice)
    → Save message, update next_round_at, broadcast 'action'
    → after(ROUND_DEBOUNCE_SECONDS) → POST /round
```

### 4. Game Loop (Sequential Mode — Combat)

```
AI specifies turn order → server tracks current player
  → Only active player's input enabled
  → After each submission → next player activated
  → After all players → AI narrates combined outcome
```

### 5. Dropped Action UX

When a player submits during a round:
- `POST /action` returns 409
- Client shows: *"The GM is already reading — your action didn't make it this round"*
- Input stays enabled; send button disabled while `round_in_progress = true`
- Button re-enables on `round:saved` broadcast event

### 6. End Session

```
Host clicks "End Session" → POST /api/session/end
  → Claude: generate session summary from all session messages
  → Save to sessions.summary_md + campaign_files (session-XX.md)
  → Compact MEMORY.md for next session
  → Set campaign.status = 'paused'
```

---

## AI Memory System

Each campaign has a virtual file system stored as rows in `campaign_files`:

| File | Purpose | Injected into prompt? |
| --- | --- | --- |
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
  "npcs": [{ "name": "...", "status": "...", "disposition": "...", "note": "..." }],
  "locations": [{ "name": "...", "status": "...", "note": "..." }],
  "character_updates": [{ "name": "...", "hp": 15, "note": "Took 5 damage" }],
  "events": ["Party discovered the hidden passage"],
  "memory_md": "Rewritten MEMORY.md content (max 500 words, present tense)"
}
```

The backend parses this block, updates the relevant MD files, and saves updated stats to the `players` table.

---

## Realtime Events

All real-time communication uses Supabase broadcast channels. No postgres_changes subscriptions.

### Game channel: `game:<campaignId>`

| Event | Payload | Direction |
| --- | --- | --- |
| `action` | `{ message }` | server → clients |
| `round:started` | `{}` | server → clients |
| `chunk` | `{ text }` | server → clients (streaming) |
| `narration` | `{ message, id }` | server → clients |
| `round:saved` | `{}` | server → clients |
| `image:ready` | `{ url, type }` | server → clients |

### World channel: `world:<worldId>`

| Event | Payload | Direction |
| --- | --- | --- |
| `world:started` | `{}` | edge fn → clients |
| `world:progress` | `{ attempt }` | edge fn → clients |
| `world:complete` | `{ world_content, classes }` | edge fn → clients |
| `image:ready` | `{ url, type }` | edge fn → clients |

---

## RPG System

**Default**: d20 rolls for uncertain outcomes. GM decides when to call for a roll and sets the difficulty.

- All characters start at 20 HP
- At 0 HP → status = `incapacitated` (can be healed by party)
- Massive damage → status = `dead`
- Host can override with custom rules via `system_description` (plain text)

---

## Player States

| Status | Description | Turn Behavior |
| --- | --- | --- |
| `active` | Normal, playing | Receives their turn |
| `dead` | Character has died | Skipped, becomes spectator |
| `incapacitated` | Unconscious (0 HP) | Skipped, AI narrates condition |
| `absent` | Player disconnected | Behavior defined by absence_mode |

| Absence Mode | Behavior |
| --- | --- |
| `skip` | Character "stays behind", removed from turn order |
| `npc` | AI controls the character in-character |
| `auto_act` | AI suggests action, host approves before submitting |

---

## Environment Variables

```env
# Next.js
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI
ANTHROPIC_API_KEY=         # Claude Sonnet for game narration + Haiku for world gen
GEMINI_API_KEY=            # Gemini for image gen

# Edge function secrets
GENERATE_WORLD_WEBHOOK_SECRET=   # Shared secret for generate-world webhook
GENERATE_IMAGE_WEBHOOK_SECRET=   # Shared secret for generate-image calls
```

---

## MVP Scope

- Create campaign with AI-generated world lore, cover art, and world map
- Share campaign via link
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

## Out of Scope (Future)

- Voice narration (ElevenLabs)
- AI players
- Messaging platform integration
- RAG / semantic search
- Campaign export
- Interactive maps
- Preset system templates
- Mobile-optimized UI
