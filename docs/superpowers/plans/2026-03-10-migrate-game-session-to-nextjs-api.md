# Migrate Game-Session to Next.js API — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Supabase Edge Function WebSocket server with stateless Next.js API routes + Vercel `after()` + Supabase Realtime broadcast, eliminating 1006 disconnects.

**Architecture:** Player actions are POSTed to `/api/game-session/[id]/action`, which saves to DB, updates `campaigns.next_round_at = NOW() + 8s`, then uses Vercel `after()` to schedule a background worker that sleeps 8s and calls `POST /round`. The round route checks `next_round_at <= NOW()` before proceeding (self-cancelling debounce: if a later action extended the timer, earlier workers skip). The round route streams from Anthropic and broadcasts events over Supabase Realtime broadcast channel `game:<campaignId>`. A shared `ROUND_DEBOUNCE_SECONDS` constant keeps the DB timer and client UI in sync.

**Tech Stack:** Next.js App Router (Node.js runtime), Vercel `after`, Supabase (Realtime broadcast), Anthropic SDK (`@anthropic-ai/sdk`), Vitest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `lib/game-session/config.ts` | Shared constants (`ROUND_DEBOUNCE_SECONDS`) |
| Create | `lib/game-session/prompt.ts` | GM system prompt builder (ported from edge fn) |
| Create | `lib/game-session/history.ts` | Conversation history builder (ported from edge fn) |
| Create | `lib/game-session/types.ts` | Shared TypeScript types (`MsgRow`, `AnthropicMessage`, `FirstCallResponse`, `RoundResponse`, `GMResponse`) |
| Create | `lib/game-session/__tests__/history.test.ts` | History builder tests |
| Create | `lib/game-session/__tests__/prompt.test.ts` | Prompt builder + type guard tests |
| Modify | `lib/realtime-broadcast.ts` | Add `broadcastGameEvent()` for `game:` channel |
| Create | `app/api/game-session/[id]/action/route.ts` | POST action — save + schedule `after()` worker |
| Create | `app/api/game-session/[id]/action/__tests__/route.test.ts` | Tests |
| Create | `app/api/game-session/[id]/round/route.ts` | POST round — debounce check + AI call + broadcast |
| Create | `app/api/game-session/[id]/round/__tests__/route.test.ts` | Tests |
| Create | `supabase/migrations/020_game_session_next_round_at.sql` | DB: `next_round_at` column |
| Modify | `app/api/campaign/[id]/start/route.ts` | Set `next_round_at=NOW()` + trigger round via `after()` |
| Modify | `app/campaign/[slug]/game/GameClient.tsx` | Remove WS, add broadcast subscription |
| Modify | `app/campaign/[slug]/game/components/DebounceTimer.tsx` | Import `ROUND_DEBOUNCE_SECONDS` |
| Delete | `supabase/functions/game-session/` | Entire directory |
| Delete | `app/campaign/[slug]/game/ws-auth.ts` | WS auth helper (no longer needed) |
| Modify | `CLAUDE.md` | Update architecture section |

---

## Chunk 1: Shared Utilities + Broadcast Helper

### Task 0: Shared debounce constant

**Files:**
- Create: `lib/game-session/config.ts`

- [ ] **Step 1: Create config file**

```typescript
// lib/game-session/config.ts

/** Debounce window in seconds. Used by the action route (server) and DebounceTimer (client). */
export const ROUND_DEBOUNCE_SECONDS = 8
```

- [ ] **Step 2: Commit**

```bash
git add lib/game-session/config.ts
git commit -m "feat: add shared ROUND_DEBOUNCE_SECONDS constant"
```

---

### Task 1: Port shared types

**Files:**
- Create: `lib/game-session/types.ts`

- [ ] **Step 1: Create types file**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/game-session/types.ts
git commit -m "feat: add game-session shared types"
```

---

### Task 2: Port history builder

**Files:**
- Create: `lib/game-session/history.ts`
- Create: `lib/game-session/__tests__/history.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/game-session/__tests__/history.test.ts
import { describe, it, expect } from 'vitest'
import { buildMessageHistory } from '../history'
import type { MsgRow } from '../types'

describe('buildMessageHistory', () => {
  it('returns empty array for no rows', () => {
    expect(buildMessageHistory([])).toEqual([])
  })

  it('wraps opening narration in first-call shape', () => {
    const rows: MsgRow[] = [
      { content: 'The tavern buzzes.', type: 'narration', players: null },
    ]
    const history = buildMessageHistory(rows)
    expect(history).toHaveLength(2)
    expect(history[0].role).toBe('user')
    expect(history[1].role).toBe('assistant')
    const parsed = JSON.parse(history[1].content as string)
    expect(parsed.narration).toEqual(['The tavern buzzes.'])
  })

  it('groups actions into a user message and narration into assistant message', () => {
    const rows: MsgRow[] = [
      { content: 'Opening.', type: 'narration', players: null },
      { content: 'I attack!', type: 'action', players: { character_name: 'Aria', username: null } },
      { content: 'She misses.', type: 'narration', players: null },
    ]
    const history = buildMessageHistory(rows)
    // [user:first-call-input, assistant:opening, user:actions, assistant:narration]
    expect(history).toHaveLength(4)
    expect(history[2].role).toBe('user')
    const actions = JSON.parse(history[2].content as string)
    expect(actions[0].playerName).toBe('Aria')
    expect(actions[0].content).toBe('I attack!')
    expect(history[3].content).toBe('She misses.')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```bash
yarn test lib/game-session/__tests__/history.test.ts
```

- [ ] **Step 3: Implement history builder**

```typescript
// lib/game-session/history.ts
import type { MsgRow, AnthropicMessage } from './types'
import { buildFirstCallInput } from './prompt'

export function buildMessageHistory(rows: MsgRow[]): AnthropicMessage[] {
  if (!rows.length) return []

  const firstActionIdx = rows.findIndex((r) => r.type === 'action')
  const openingEnd = firstActionIdx === -1 ? rows.length : firstActionIdx
  const openingParts = rows
    .slice(0, openingEnd)
    .filter((r) => r.type === 'narration')
    .map((r) => r.content)

  if (!openingParts.length) return []

  const history: AnthropicMessage[] = []
  history.push({ role: 'user', content: buildFirstCallInput() })
  history.push({
    role: 'assistant',
    content: JSON.stringify({
      world_context: { history: '', factions: '', tone: '' },
      opening_situation: '',
      starting_hooks: [],
      actions: [],
      narration: openingParts,
    }),
  })

  if (firstActionIdx === -1) return history

  let actionBatch: Array<{ playerName: string; content: string }> = []
  for (let i = firstActionIdx; i < rows.length; i++) {
    const row = rows[i]
    if (row.type === 'narration') {
      if (actionBatch.length > 0) {
        history.push({ role: 'user', content: JSON.stringify(actionBatch) })
        actionBatch = []
        history.push({ role: 'assistant', content: row.content })
      } else {
        const last = history[history.length - 1]
        if (last.role === 'assistant') {
          last.content = (last.content as string) + '\n\n' + row.content
        } else {
          history.push({ role: 'assistant', content: row.content })
        }
      }
    } else if (row.type === 'action') {
      const playerName = row.players?.character_name ?? row.players?.username ?? 'Unknown'
      actionBatch.push({ playerName, content: row.content })
    }
  }

  return history
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
yarn test lib/game-session/__tests__/history.test.ts
```

Expected: 3 passing

- [ ] **Step 5: Commit**

```bash
git add lib/game-session/history.ts lib/game-session/__tests__/history.test.ts
git commit -m "feat: add game-session history builder"
```

---

### Task 3: Port prompt builder

**Files:**
- Create: `lib/game-session/prompt.ts`

- [ ] **Step 1: Create prompt file**

```typescript
// lib/game-session/prompt.ts
import type { FirstCallResponse } from './types'

interface PlayerInput {
  character_name: string | null
  character_class: string | null
  character_backstory: string | null
  username?: string | null
}

export function buildGMSystemPrompt(worldContent: string, players: PlayerInput[]): string {
  const playerList = players
    .map((p) => {
      const name = p.character_name ?? p.username ?? 'Unknown'
      const cls = p.character_class ?? 'unknown class'
      const backstory = p.character_backstory ? `: ${p.character_backstory}` : ''
      return `- ${name} (${cls})${backstory}`
    })
    .join('\n')

  // Full prompt text — identical to supabase/functions/game-session/prompt.ts
  return `<role>
You are the Game Master for a tabletop RPG campaign. Narrate the story in second person,
immersive prose. React to all player actions collectively. Detect the language used in
the world description and write all narration entirely in that language.
</role>

<world>
${worldContent}
</world>

<player-characters>
${playerList}
</player-characters>

<narration-rules>
- Address all player actions in each narration. No player is ignored.
- Keep narrations to 1-2 paragraphs maximum. Every sentence must earn its place. Be vivid but ruthlessly concise.
- End each narration with a clear situation: what the players see, hear, or face next.
- If a player's action is impossible or fails, narrate the failure dramatically.
- Never break character. Never acknowledge you are an AI.
- Language: always write in the world's language, determined from the world description. NEVER switch languages regardless of what language a player uses in their action. If a player writes in English but the world is Portuguese, narrate in Portuguese. This is an absolute rule — not a preference. Not once, not ever.
- Never address players directly as players. Never say things like "you need to find a hook first" or "you can't do that yet" or "if you want, you can...". You are always the world, never the narrator explaining the rules. If a player action doesn't fit the current situation, have the world react — an NPC responds, the environment pushes back, reality simply doesn't cooperate — but never step outside the fiction to explain or redirect.

Player placement: Players may begin together, in small groups, or alone — honor the
opening situation exactly. When players are split, narrate each group's location and
immediate reality. Bring them together only when the story earns it.

Opening narration: Start the story in a mundane moment — a tavern, a market stall, a job
going wrong, a quiet morning before everything changes. Establish who each player is and
where they are through sensory detail: what they see, hear, smell, the people around them.
Do NOT present quests, choices, or adventure hooks in the opening. Do NOT end with
"what do you do?" or any explicit question. Let the world breathe first. The hooks exist
for you to weave in gradually — a rumor overheard, a stranger's glance, a distant smoke
column — never stated outright.

End of opening: The final beat must land each player character in an active, present-tense
moment that demands a response — a stranger addresses them directly, a hand grips their
shoulder, a sound snaps their attention across the room, eyes lock with theirs through the
crowd. Do NOT close on passive description or general atmosphere. The last sentence should
feel like a door swinging open: the player instinctively knows it is their moment to act,
without being told so.

Story hooks: These are yours to develop, not announce. Introduce each hook as a background
detail, an NPC's offhand remark, or an environmental clue. Never name a hook directly.
By round 2 hooks should feel present. By round 4 they must feel urgent. By round 6 a hook
must have erupted into open crisis — something the players cannot ignore. When a player
actively investigates a hook — asks questions, follows a lead, commits to pursuing it —
reward that engagement immediately: reveal something real, advance the plot, give forward
momentum now. Do not respond with another clue to chase later. Investigating a hook earns
a revelation, not a delay.

Small talk and off-topic messages: Distinguish between out-of-character (OOC) chatter and
in-character (IC) roleplay between player characters. OOC chatter — players speaking as
themselves, joking around, or asking questions unrelated to the scene — gets at most one
short sentence, then cut immediately to the world acting: an NPC speaks up, a sound splits
the air, something shifts in the environment. The scene does not pause for OOC idle
conversation. IC roleplay between characters is game content: amplify it. Weave it into
the scene, have NPCs notice and react, let it reveal character and deepen the fiction. Never
suppress IC interaction — honor it and build on it.

Passive actions: Single words ("ok", "yes", "sure"), acknowledgements, questions with no
physical action ("where are we going?", "when will we arrive?"), and declarations of
inactivity ("I'll sleep", "I'll wait", "I'll follow") are passive. For passive actions:
write ONE sentence of acknowledgement at most, then immediately inject an event that forces
engagement. Do NOT write more than one paragraph for a passive action. Do NOT keep the scene
in a comfortable lull.

Proactive GM: You do not wait for players to engage the story. Every narration — regardless
of what the players said — must advance the scene. If their actions were passive or
off-topic, invent a beat: an NPC approaches with urgency, a commotion breaks out nearby, a
message is slipped into a hand. Never end a narration in the same tension level it started.

Escalation — MANDATORY: Keep an internal count of consecutive passive/off-topic rounds.
Round 1 passive: reduce your response to 1 short paragraph and inject an environmental event.
Round 2 passive: a direct threat or confrontation begins — someone is grabbed, a weapon
appears, an alarm sounds. This is not optional.
Round 3 passive: full crisis — violence, fire, arrest, ambush. The players are physically
forced to react. There is no round 4 of passivity.
Reset the counter whenever a player takes a meaningful physical or narrative action.

World texture: Weave world-specific details (locations, factions, creatures, history) into
every narration. The world should feel alive and specific, not generic.

Pacing: This campaign is meant to be short and intense. Drive toward confrontations,
revelations, and decisions. Avoid filler. Every narration should end with the players on
the edge of something — never in a comfortable lull.
</narration-rules>

<mechanics-rules>
- HP is tracked on a 0-20 scale.
- D20 rolls determine success on contested or risky actions.
- Describe dice outcomes narratively — never expose raw numbers.
</mechanics-rules>

<output-format>
First response must be a JSON object. No markdown fences, no text outside the JSON.

First response schema:
{
  "world_context": { "history": "string", "factions": "string", "tone": "string" },
  "opening_situation": "string",
  "starting_hooks": ["string", "string", "string"],
  "actions": [],
  "narration": ["string"]
}

All subsequent responses: return ONLY the narration as plain prose text.
No JSON, no markdown, no labels. Just the narration paragraphs, separated by blank lines.
</output-format>`
}

export function buildFirstCallInput(): string {
  return `Generate this world's History, Factions, and Tone. Then plan the opening situation and three starting hooks — these are for your internal use only, not to be spoken aloud. Then narrate the opening scene: place the players in a grounded, everyday moment in this world. Describe the environment and the people around them vividly. Do not mention quests, hooks, or adventure yet. Respond using the first response schema.`
}

export function isFirstCallResponse(response: unknown): response is FirstCallResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'world_context' in response &&
    typeof (response as Record<string, unknown>).world_context === 'object' &&
    (response as Record<string, unknown>).world_context !== null
  )
}
```

- [ ] **Step 2: Write and run tests for prompt helpers**

```typescript
// lib/game-session/__tests__/prompt.test.ts
import { describe, it, expect } from 'vitest'
import { buildGMSystemPrompt, isFirstCallResponse, buildFirstCallInput } from '../prompt'

describe('buildFirstCallInput', () => {
  it('returns a non-empty string', () => {
    expect(typeof buildFirstCallInput()).toBe('string')
    expect(buildFirstCallInput().length).toBeGreaterThan(0)
  })
})

describe('isFirstCallResponse', () => {
  it('returns true for valid first-call response', () => {
    expect(isFirstCallResponse({
      world_context: { history: '', factions: '', tone: '' },
      narration: ['hello'],
    })).toBe(true)
  })

  it('returns false for null', () => {
    expect(isFirstCallResponse(null)).toBe(false)
  })

  it('returns false when world_context is missing', () => {
    expect(isFirstCallResponse({ narration: [] })).toBe(false)
  })

  it('returns false when world_context is not an object', () => {
    expect(isFirstCallResponse({ world_context: 42 })).toBe(false)
  })
})

describe('buildGMSystemPrompt', () => {
  it('includes player name in output', () => {
    const result = buildGMSystemPrompt('A dark world.', [
      { character_name: 'Aria', character_class: 'Rogue', character_backstory: null },
    ])
    expect(result).toContain('Aria')
    expect(result).toContain('Rogue')
  })

  it('falls back to username when character_name is null', () => {
    const result = buildGMSystemPrompt('World.', [
      { character_name: null, character_class: null, character_backstory: null, username: 'player1' },
    ])
    expect(result).toContain('player1')
  })
})
```

Run:
```bash
yarn test lib/game-session/__tests__/prompt.test.ts
```

Expected: all passing

- [ ] **Step 3: Commit**

```bash
git add lib/game-session/prompt.ts lib/game-session/__tests__/prompt.test.ts
git commit -m "feat: add game-session prompt builder with tests"
```

---

### Task 4: Add broadcastGameEvent helper

**Files:**
- Modify: `lib/realtime-broadcast.ts`

- [ ] **Step 1: Add `broadcastGameEvent` export**

Append to `lib/realtime-broadcast.ts`:

```typescript
export async function broadcastGameEvent(
  campaignId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  await broadcastToTopic(`game:${campaignId}`, event, payload)
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/realtime-broadcast.ts
git commit -m "feat: add broadcastGameEvent for game channel"
```

---

## Chunk 2: DB Migration

### Task 5: Add next_round_at column

**Files:**
- Create: `supabase/migrations/020_game_session_next_round_at.sql`

- [ ] **Step 1: Create migration**

```sql
-- supabase/migrations/020_game_session_next_round_at.sql

-- Add next_round_at for Vercel after()-based debounce scheduling.
-- Each player action sets next_round_at = NOW() + ROUND_DEBOUNCE_SECONDS.
-- The after() worker fires after the debounce window and checks next_round_at <= NOW()
-- before proceeding. If a later action extended the timer, the worker skips.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS next_round_at TIMESTAMPTZ;

-- Remove messages table from realtime publication — replaced by broadcast.
-- This is safe to run even if messages is not currently in the publication.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE messages;
  END IF;
END $$;
```

- [ ] **Step 2: Apply migration locally**

```bash
npx supabase db push
```

Expected: migration applied without errors

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/020_game_session_next_round_at.sql
git commit -m "feat: add next_round_at column for debounce scheduling"
```

---

### Task 6: Trigger opening narration on campaign start

**Files:**
- Modify: `app/api/campaign/[id]/start/route.ts`

The `start` route sets `status = 'active'`. We also set `next_round_at = NOW()` and use `after()` to immediately trigger the opening narration round (no sleep needed — fire right away).

- [ ] **Step 1: Add import and update the start route**

At the top of `app/api/campaign/[id]/start/route.ts`, add:
```typescript
import { after } from 'next/server'
```

Find the `supabase.from('campaigns').update({ status: 'active' })` call and add `next_round_at`:

```typescript
// Replace:
const { error: updateError } = await supabase
  .from('campaigns')
  .update({ status: 'active' })
  .eq('id', campaignId)
  .eq('status', 'lobby')
  .select('id')
  .single()

// With:
const { error: updateError } = await supabase
  .from('campaigns')
  .update({ status: 'active', next_round_at: new Date().toISOString() })
  .eq('id', campaignId)
  .eq('status', 'lobby')
  .select('id')
  .single()
```

After the `broadcastCampaignEvent` call, schedule the opening narration:

```typescript
// Trigger opening narration immediately via after()
const appUrl = process.env.NEXT_PUBLIC_APP_URL
  ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
after(async () => {
  await fetch(`${appUrl}/api/game-session/${campaignId}/round`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
  })
})
```

- [ ] **Step 2: Update start route tests to assert next_round_at**

In `app/api/campaign/[id]/start/__tests__/route.test.ts`, update the success test to assert that `next_round_at` is included in the update payload. Capture the mock call args and assert the update object includes `next_round_at`.

- [ ] **Step 3: Run start route tests**

```bash
yarn test app/api/campaign/[id]/start/__tests__/route.test.ts
```

Expected: all passing

- [ ] **Step 3: Commit**

```bash
git add app/api/campaign/[id]/start/route.ts
git commit -m "feat: set next_round_at on campaign start to trigger opening narration"
```

---

## Chunk 3: POST /action Route

### Task 7: Action route — tests first

**Files:**
- Create: `app/api/game-session/[id]/action/__tests__/route.test.ts`
- Create: `app/api/game-session/[id]/action/route.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// app/api/game-session/[id]/action/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockCampaignSelect = vi.fn()
const mockPlayerSelect = vi.fn()
const mockMessageInsert = vi.fn()
const mockCampaignUpdate = vi.fn()
const mockBroadcastGameEvent = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createAuthServerClient: vi.fn(() =>
    Promise.resolve({ auth: { getUser: mockGetUser } })
  ),
  createServerSupabaseClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'campaigns') {
        return {
          select: vi.fn(() => ({ eq: mockCampaignSelect })),
          update: vi.fn(() => ({ eq: mockCampaignUpdate })),
        }
      }
      if (table === 'players') {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: mockPlayerSelect })) })) }
      }
      if (table === 'messages') {
        return { insert: mockMessageInsert }
      }
      return {}
    },
  })),
}))

vi.mock('@/lib/realtime-broadcast', () => ({
  broadcastGameEvent: mockBroadcastGameEvent,
}))

describe('POST /api/game-session/[id]/action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBroadcastGameEvent.mockResolvedValue(undefined)
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const { POST } = await import('../route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ id: 'msg-1', content: 'I attack' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'campaign-1' }) })

    expect(res.status).toBe(401)
  })

  it('returns 409 when round_in_progress', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCampaignSelect.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: 'campaign-1', round_in_progress: true },
        error: null,
      }),
    })
    mockPlayerSelect.mockResolvedValue({ data: { id: 'player-1' }, error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ id: 'msg-1', content: 'I attack' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'campaign-1' }) })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.reason).toBe('round_in_progress')
  })

  it('saves action and updates next_round_at when round is not in progress', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCampaignSelect.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: 'campaign-1', round_in_progress: false },
        error: null,
      }),
    })
    mockPlayerSelect.mockResolvedValue({ data: { id: 'player-1' }, error: null })
    mockMessageInsert.mockResolvedValue({ error: null })
    mockCampaignUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })

    const { POST } = await import('../route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ id: 'msg-1', content: 'I attack' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'campaign-1' }) })

    expect(res.status).toBe(201)
    expect(mockMessageInsert).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'I attack', type: 'action', processed: false })
    )
    expect(mockBroadcastGameEvent).toHaveBeenCalledWith(
      'campaign-1',
      'action',
      expect.objectContaining({ content: 'I attack' })
    )
  })

  it('returns 403 when user is not a player in campaign', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockCampaignSelect.mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: 'campaign-1', round_in_progress: false },
        error: null,
      }),
    })
    mockPlayerSelect.mockResolvedValue({ data: null, error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ id: 'msg-1', content: 'I attack' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'campaign-1' }) })

    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```bash
yarn test app/api/game-session/[id]/action/__tests__/route.test.ts
```

- [ ] **Step 3: Implement action route**

```typescript
// app/api/game-session/[id]/action/route.ts
import { NextResponse, after } from 'next/server'
import { createAuthServerClient, createServerSupabaseClient } from '@/lib/supabase/server'
import { broadcastGameEvent } from '@/lib/realtime-broadcast'
import { ROUND_DEBOUNCE_SECONDS } from '@/lib/game-session/config'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const authClient = await createAuthServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient()

  // Verify player membership
  const { data: player } = await supabase
    .from('players')
    .select('id, character_name, username')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!player) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Check round lock
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, round_in_progress')
    .eq('id', campaignId)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.round_in_progress) {
    return NextResponse.json({ reason: 'round_in_progress' }, { status: 409 })
  }

  let body: { id?: string; content?: string; timestamp?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.id || !body.content) {
    return NextResponse.json({ error: 'Missing id or content' }, { status: 400 })
  }

  // Save action
  const { error: insertError } = await supabase
    .from('messages')
    .insert({
      campaign_id: campaignId,
      player_id: player.id,
      content: body.content,
      type: 'action' as const,
      client_id: body.id,
      processed: false,
    })

  if (insertError) {
    // Duplicate client_id (reconnect replay) — treat as success
    if (insertError.code === '23505') {
      return NextResponse.json({ ok: true }, { status: 200 })
    }
    return NextResponse.json({ error: 'Failed to save action' }, { status: 500 })
  }

  // Push next_round_at forward — self-cancelling debounce.
  // Any worker that fires before this timestamp will skip.
  const nextRoundAt = new Date(Date.now() + ROUND_DEBOUNCE_SECONDS * 1000).toISOString()
  await supabase
    .from('campaigns')
    .update({ next_round_at: nextRoundAt })
    .eq('id', campaignId)

  // Broadcast action to all game clients
  const playerName = (player.character_name ?? player.username ?? 'Unknown') as string
  await broadcastGameEvent(campaignId, 'action', {
    id: body.id,
    campaign_id: campaignId,
    player_id: player.id,
    content: body.content,
    type: 'action',
    client_id: body.id,
    processed: false,
    created_at: new Date().toISOString(),
    playerName,
  })

  // Schedule round worker: fires after debounce window.
  // Checks next_round_at on arrival — if extended by a later action, skips.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, ROUND_DEBOUNCE_SECONDS * 1000))
    await fetch(`${appUrl}/api/game-session/${campaignId}/round`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}` },
    })
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
yarn test app/api/game-session/[id]/action/__tests__/route.test.ts
```

Expected: 4 passing

- [ ] **Step 5: Commit**

```bash
git add app/api/game-session/[id]/action/route.ts app/api/game-session/[id]/action/__tests__/route.test.ts
git commit -m "feat: add POST /api/game-session/[id]/action route"
```

---

## Chunk 4: POST /round Route

### Task 8: Round route — tests first

**Files:**
- Create: `app/api/game-session/[id]/round/__tests__/route.test.ts`
- Create: `app/api/game-session/[id]/round/route.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// app/api/game-session/[id]/round/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCampaignUpdate = vi.fn()
const mockCampaignSelect = vi.fn()
const mockMessagesUpdate = vi.fn()
const mockMessagesInsert = vi.fn()
const mockMessagesSelect = vi.fn()
const mockWorldSelect = vi.fn()
const mockPlayersSelect = vi.fn()
const mockBroadcastGameEvent = vi.fn()
const mockAnthropicStream = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'campaigns') {
        return {
          update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => mockCampaignUpdate()) })) })) })),
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: mockCampaignSelect })) })),
        }
      }
      if (table === 'messages') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => mockMessagesUpdate()) })) })) })),
          })),
          insert: mockMessagesInsert,
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ in: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => mockMessagesSelect()) })) })) })),
          })),
        }
      }
      if (table === 'worlds') {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: mockWorldSelect })) })) }
      }
      if (table === 'players') {
        return { select: vi.fn(() => ({ eq: mockPlayersSelect })) }
      }
      return {}
    },
  })),
}))

vi.mock('@/lib/realtime-broadcast', () => ({
  broadcastGameEvent: mockBroadcastGameEvent,
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: {
      stream: mockAnthropicStream,
    },
  })),
}))

vi.mock('@/lib/game-session/prompt', () => ({
  buildGMSystemPrompt: vi.fn(() => 'system-prompt'),
  isFirstCallResponse: vi.fn((r: unknown) => {
    return typeof r === 'object' && r !== null && 'world_context' in r
  }),
}))

vi.mock('@/lib/game-session/history', () => ({
  buildMessageHistory: vi.fn(() => []),
}))

describe('POST /api/game-session/[id]/round', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBroadcastGameEvent.mockResolvedValue(undefined)
    mockMessagesInsert.mockResolvedValue({ error: null })
  })

  it('returns 401 without service role key', async () => {
    const { POST } = await import('../route')
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-key' },
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'campaign-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 409 when lock cannot be acquired', async () => {
    mockCampaignUpdate.mockResolvedValue({ data: [], error: null })

    const { POST } = await import('../route')
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-service-role-key' },
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'campaign-1' }) })
    expect(res.status).toBe(409)
  })

  it('broadcasts round:started and round:saved on success', async () => {
    // Lock acquired
    mockCampaignUpdate.mockResolvedValue({ data: [{ id: 'campaign-1' }], error: null })

    // Campaign data
    mockCampaignSelect.mockResolvedValue({
      data: { world_id: 'world-1', next_round_at: new Date(Date.now() - 5000).toISOString() },
      error: null,
    })

    // Claimed actions
    mockMessagesUpdate.mockResolvedValue({
      data: [{ id: 'msg-1', player_id: 'player-1', content: 'I attack', client_id: null }],
      error: null,
    })

    // History
    mockMessagesSelect.mockResolvedValue({ data: [], error: null })

    // World
    mockWorldSelect.mockResolvedValue({
      data: { world_content: 'A fantasy world.' },
      error: null,
    })

    // Players
    mockPlayersSelect.mockResolvedValue({
      data: [{ id: 'player-1', character_name: 'Aria', username: null }],
      error: null,
    })

    // Anthropic stream mock: emits one text chunk
    const fakeStream = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'The sword strikes!' } }
      },
    }
    mockAnthropicStream.mockReturnValue(fakeStream)

    const { POST } = await import('../route')
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-service-role-key' },
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'campaign-1' }) })

    expect(res.status).toBe(200)
    expect(mockBroadcastGameEvent).toHaveBeenCalledWith('campaign-1', 'round:started', {})
    expect(mockBroadcastGameEvent).toHaveBeenCalledWith('campaign-1', 'chunk', { content: 'The sword strikes!' })
    expect(mockBroadcastGameEvent).toHaveBeenCalledWith('campaign-1', 'round:saved', {})
  })

  it('broadcasts round:saved and returns skipped when no actions to process', async () => {
    // Lock acquired
    mockCampaignUpdate.mockResolvedValue({ data: [{ id: 'campaign-1' }], error: null })

    // Campaign data — next_round_at in the past so debounce passes
    mockCampaignSelect.mockResolvedValue({
      data: { world_id: 'world-1', next_round_at: new Date(Date.now() - 5000).toISOString() },
      error: null,
    })

    // No claimed actions (empty array)
    mockMessagesUpdate.mockResolvedValue({ data: [], error: null })

    // Has existing narration (not a first call)
    const mockNarrationSelect = vi.fn().mockResolvedValue({ data: [{ id: 'narration-1' }], error: null })
    // Wire into messages select for narration check — we rely on the mock structure

    const { POST } = await import('../route')
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-service-role-key' },
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'campaign-1' }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toBe(true)
    // Must broadcast round:saved so clients aren't stuck with roundInProgress=true
    expect(mockBroadcastGameEvent).toHaveBeenCalledWith('campaign-1', 'round:saved', {})
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
yarn test app/api/game-session/[id]/round/__tests__/route.test.ts
```

- [ ] **Step 3: Implement round route**

```typescript
// app/api/game-session/[id]/round/route.ts
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { broadcastGameEvent } from '@/lib/realtime-broadcast'
import { buildGMSystemPrompt, isFirstCallResponse, buildFirstCallInput } from '@/lib/game-session/prompt'
import { buildMessageHistory } from '@/lib/game-session/history'
import type { MsgRow } from '@/lib/game-session/types'

// Allow long-running AI calls on Vercel Pro (up to 300s)
export const maxDuration = 300

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  // Auth: only service role key (called by Vercel after() worker or campaign start route)
  const authHeader = req.headers.get('authorization')
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!authHeader || authHeader !== `Bearer ${serviceRoleKey}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()
  let lockAcquired = false

  try {
    // Try to acquire round lock
    const { data: claimed, error: claimError } = await supabase
      .from('campaigns')
      .update({ round_in_progress: true })
      .eq('id', campaignId)
      .eq('round_in_progress', false)
      .select('id')

    if (claimError) {
      return NextResponse.json({ error: 'DB error' }, { status: 500 })
    }
    if (!claimed?.length) {
      return NextResponse.json({ reason: 'lock_busy' }, { status: 409 })
    }

    lockAcquired = true

    // Check self-cancelling debounce: if next_round_at was pushed forward by a later action,
    // this worker is stale — release the lock and skip.
    const { data: campaignCheck } = await supabase
      .from('campaigns')
      .select('next_round_at, world_id')
      .eq('id', campaignId)
      .single()

    if (
      campaignCheck?.next_round_at &&
      new Date(campaignCheck.next_round_at) > new Date()
    ) {
      return NextResponse.json({ skipped: 'debounce_extended' })
    }

    await broadcastGameEvent(campaignId, 'round:started', {})

    // campaignCheck already has world_id from the debounce check above
    const campaign = campaignCheck
    if (!campaign) throw new Error('Campaign not found')

    // Check if this is the opening narration (no narration messages yet)
    const { data: existingNarration } = await supabase
      .from('messages')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('type', 'narration')
      .limit(1)

    const isFirstCall = !existingNarration?.length

    // Load world + players (needed for both first call and normal rounds)
    const [worldResult, playersResult] = await Promise.all([
      supabase.from('worlds').select('world_content').eq('id', campaign.world_id).single(),
      supabase.from('players')
        .select('id, character_name, character_class, character_backstory, username')
        .eq('campaign_id', campaignId),
    ])

    if (worldResult.error || !worldResult.data?.world_content) throw new Error('World not found')
    if (playersResult.error) throw new Error('Players not found')

    const systemPrompt = buildGMSystemPrompt(
      worldResult.data.world_content as string,
      playersResult.data ?? []
    )

    // CachedMsg allows either string or array content (for cache_control on last history msg)
    type CachedMsg = { role: 'user' | 'assistant'; content: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> }
    let messages: CachedMsg[]

    if (isFirstCall) {
      messages = [{ role: 'user', content: buildFirstCallInput() }]
    } else {
      // Atomically claim all unprocessed actions
      const { data: claimedActions, error: claimActionsError } = await supabase
        .from('messages')
        .update({ processed: true })
        .eq('campaign_id', campaignId)
        .eq('type', 'action')
        .eq('processed', false)
        .select('*')

      if (claimActionsError) throw claimActionsError

      if (!claimedActions?.length) {
        // No actions to process — signal clients (round:started already broadcast) then return.
        // Without this, clients are stuck with roundInProgress=true indefinitely.
        await broadcastGameEvent(campaignId, 'round:saved', {})
        return NextResponse.json({ ok: true, skipped: true })
      }

      // Load full conversation history
      const { data: historyRows, error: historyError } = await supabase
        .from('messages')
        .select('content, type, players(character_name, username)')
        .eq('campaign_id', campaignId)
        .in('type', ['action', 'narration'])
        .eq('processed', true)
        .order('created_at', { ascending: true })

      if (historyError) throw historyError

      const history = buildMessageHistory((historyRows ?? []) as MsgRow[])

      // Build player name map
      const playerIds = [...new Set(claimedActions.map((a) => a.player_id).filter(Boolean))]
      const { data: playerNameRows } = await supabase
        .from('players')
        .select('id, character_name, username')
        .in('id', playerIds)

      const playerNameMap = new Map(
        (playerNameRows ?? []).map((p) => [
          p.id as string,
          (p.character_name ?? p.username ?? 'Unknown') as string,
        ])
      )

      const currentInput = JSON.stringify(
        claimedActions.map((a) => ({
          playerName: playerNameMap.get(a.player_id ?? '') ?? 'Unknown',
          content: a.content,
        }))
      )

      // Apply prompt cache to last history message.
      // AnthropicMessage.content is string; here we expand the last entry to the
      // cache_control array form that the Anthropic SDK accepts.
      const messagesWithCache: CachedMsg[] = history.map((msg, i) => {
        if (i === history.length - 1 && history.length > 0) {
          return {
            ...msg,
            content: [{ type: 'text' as const, text: msg.content, cache_control: { type: 'ephemeral' as const } }],
          }
        }
        return msg
      })

      messages = [...messagesWithCache, { role: 'user', content: currentInput }]
    }

    // Stream from Anthropic
    const rawStream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: isFirstCall ? 4096 : 1024,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages,
    })

    let fullText = ''
    for await (const event of rawStream as AsyncIterable<{ type: string; delta?: { type: string; text?: string } }>) {
      if (
        event.type === 'content_block_delta' &&
        event.delta?.type === 'text_delta' &&
        event.delta.text
      ) {
        fullText += event.delta.text
        await broadcastGameEvent(campaignId, 'chunk', { content: event.delta.text })
      }
    }

    // Parse and save narration
    let narrationParts: string[]

    if (isFirstCall) {
      const parsed = JSON.parse(fullText)
      if (!isFirstCallResponse(parsed) || !Array.isArray(parsed.narration)) {
        throw new Error('Invalid first-call response')
      }
      narrationParts = parsed.narration.filter((p: unknown): p is string => typeof p === 'string')
    } else {
      narrationParts = fullText
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
    }

    if (!narrationParts.length) throw new Error('Empty narration')

    const { error: insertError } = await supabase
      .from('messages')
      .insert(
        narrationParts.map((paragraph) => ({
          campaign_id: campaignId,
          player_id: null,
          content: paragraph,
          type: 'narration' as const,
          client_id: null,
          processed: true,
        }))
      )

    if (insertError) throw insertError

    // Broadcast each narration paragraph
    for (const paragraph of narrationParts) {
      await broadcastGameEvent(campaignId, 'narration', {
        campaign_id: campaignId,
        player_id: null,
        content: paragraph,
        type: 'narration',
        processed: true,
        created_at: new Date().toISOString(),
      })
    }

    await broadcastGameEvent(campaignId, 'round:saved', {})

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(JSON.stringify({ level: 'error', event: 'game_session.round_failed', campaignId, message }))
    await broadcastGameEvent(campaignId, 'round:error', { message: 'Failed to generate narration' })
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    if (lockAcquired) {
      await supabase
        .from('campaigns')
        .update({ round_in_progress: false, next_round_at: null })
        .eq('id', campaignId)
    }
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
yarn test app/api/game-session/[id]/round/__tests__/route.test.ts
```

Expected: 4 passing

- [ ] **Step 5: Run all tests**

```bash
yarn test
```

Expected: all passing

- [ ] **Step 6: Commit**

```bash
git add app/api/game-session/[id]/round/route.ts app/api/game-session/[id]/round/__tests__/route.test.ts
git commit -m "feat: add POST /api/game-session/[id]/round route"
```

---

## Chunk 5: Client Refactor + Cleanup

### Task 9: Refactor GameClient.tsx

**Files:**
- Modify: `app/campaign/[slug]/game/GameClient.tsx`

The file is ~2363 lines. Changes are localised to the `GameClient` component function (the last component in the file, starting around line 2090).

- [ ] **Step 1: Remove WebSocket state declarations**

Find and remove these `useState` declarations (around lines 2099-2105):

```typescript
// Remove:
const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>(
  'connecting'
);
const [isSilentReconnect, setIsSilentReconnect] = useState(false);
const wsRef = useRef<WebSocket | null>(null);
```

- [ ] **Step 2: Add round_in_progress state and droppedAction notice state**

After `const [isStreaming, setIsStreaming] = useState(false);` add:

```typescript
const [roundInProgress, setRoundInProgress] = useState(false);
const [droppedActionId, setDroppedActionId] = useState<string | null>(null);
```

- [ ] **Step 3: Replace the WebSocket useEffect with broadcast subscription**

Remove the entire WebSocket `useEffect` (from `// WebSocket connection with exponential-backoff reconnection` to the closing `}, [campaign.id]);`).

Replace with:

```typescript
// Subscribe to Supabase Realtime broadcast channel for all game events.
useEffect(() => {
  const supabase = createClient();
  const channel = supabase
    .channel(`game:${campaign.id}`)
    .on('broadcast', { event: 'action' }, ({ payload }) => {
      const msg = payload as Message & { playerName?: string };
      if (msg.client_id) {
        setOptimisticMessages((prev) => prev.filter((m) => m.id !== msg.client_id));
      }
      if (msg.type === 'action') {
        setLastActionSentAt(new Date(msg.created_at).getTime());
      }
      setLiveMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });
    })
    .on('broadcast', { event: 'narration' }, ({ payload }) => {
      const msg = payload as Message;
      setLiveMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });
      setViewState((prev) => (prev === 'loading' ? 'active' : prev));
    })
    .on('broadcast', { event: 'chunk' }, ({ payload }) => {
      setIsStreaming(true);
      setLastActionSentAt(null);
      setStreamingContent((prev) => prev + ((payload as { content: string }).content ?? ''));
      setViewState((prev) => (prev === 'loading' ? 'active' : prev));
    })
    .on('broadcast', { event: 'round:started' }, () => {
      setRoundInProgress(true);
    })
    .on('broadcast', { event: 'round:saved' }, () => {
      setIsStreaming(false);
      setStreamingContent('');
      setRoundInProgress(false);
    })
    .on('broadcast', { event: 'round:error' }, () => {
      setViewState((prev) => (prev === 'loading' ? 'active' : prev));
      setIsStreaming(false);
      setLastActionSentAt(null);
      setRoundInProgress(false);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [campaign.id]);
```

- [ ] **Step 4: Remove the postgres_changes useEffect**

Remove the entire `useEffect` from `// Supabase Realtime: subscribe to new message inserts` to its closing `}, [campaign.id]);` (around lines 2251-2307).

- [ ] **Step 5: Replace handleSend to use REST instead of WebSocket**

Replace the entire `handleSend` function (around lines 2309-2337) with:

```typescript
const handleSend = async (content: string) => {
  const id = crypto.randomUUID();
  const timestamp = Date.now();

  setOptimisticMessages((prev) => [
    ...prev,
    {
      id,
      playerId: currentPlayer?.id ?? '',
      playerName,
      content,
      timestamp,
      isOwn: true,
    },
  ]);

  try {
    const res = await fetch(`/api/game-session/${campaign.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, content, timestamp }),
    });

    if (res.status === 409) {
      setOptimisticMessages((prev) => prev.filter((m) => m.id !== id));
      setDroppedActionId(id);
      setTimeout(() => setDroppedActionId(null), 5000);
    } else if (!res.ok) {
      setOptimisticMessages((prev) => prev.filter((m) => m.id !== id));
    }
  } catch {
    setOptimisticMessages((prev) => prev.filter((m) => m.id !== id));
  }
};
```

- [ ] **Step 6: Update ActiveGameView props**

Find the `<ActiveGameView ... />` render (around line 2345). Update props:
- Remove: `wsStatus={wsStatus}`, `isSilentReconnect={isSilentReconnect}`
- Add: `roundInProgress={roundInProgress}`, `droppedActionId={droppedActionId}`

- [ ] **Step 7: Update ActiveGameView to use roundInProgress for button state and show dropped notice**

Find the `ActiveGameView` component definition and its props type. Update:

1. Replace `wsStatus` and `isSilentReconnect` in the props type with:
   ```typescript
   roundInProgress: boolean;
   droppedActionId: string | null;
   ```

2. Find where the transmit/send button is rendered in `ActiveGameView` (or `MobileActionBar`). Disable it when `roundInProgress` is true.

3. Show dropped action notice when `droppedActionId` is not null. Add near the send button:
   ```tsx
   {droppedActionId && (
     <p className="text-xs text-furnace" style={{ fontFamily: 'var(--font-mono)' }}>
       The GM is already reading — your action didn't make it this round.
     </p>
   )}
   ```

- [ ] **Step 8: Update `onSend` prop type to async**

Any component that receives `handleSend` via an `onSend` prop (e.g., `MobileActionBar`, `ActiveGameView`, `PlayerInputBar`) will have its prop typed as `(content: string) => void`. Update those type declarations to:

```typescript
onSend: (content: string) => Promise<void>
```

- [ ] **Step 9: Remove connection banner block**

Search for `showConnectionBanner` (or `wsStatus === 'connecting'`) in `GameClient.tsx`. Remove the connection banner JSX block and any state/variable that drives it (e.g., `const showConnectionBanner = wsStatus === 'connecting' && !isSilentReconnect`).

- [ ] **Step 10: Remove `optimisticMessagesRef` dead code**

If `optimisticMessagesRef` exists in the file after the WebSocket removal (it was used to track which messages had been confirmed via WS), remove it and any references to it.

- [ ] **Step 11: Update DebounceTimer to use shared constant**

In `app/campaign/[slug]/game/components/DebounceTimer.tsx`, replace the hardcoded constant:

```typescript
// Remove:
const TOTAL_SECONDS = 8

// Add at top of file:
import { ROUND_DEBOUNCE_SECONDS as TOTAL_SECONDS } from '@/lib/game-session/config'
```

- [ ] **Step 12: Run the build to catch type errors**

```bash
yarn build
```

Fix any TypeScript errors before continuing.

- [ ] **Step 13: Commit**

```bash
git add app/campaign/[slug]/game/GameClient.tsx app/campaign/[slug]/game/components/DebounceTimer.tsx
git commit -m "feat: replace WebSocket with Supabase Realtime broadcast in GameClient"
```

---

### Task 10: Delete edge function and ws-auth

**Files:**
- Delete: `supabase/functions/game-session/` (entire directory)
- Delete: `app/campaign/[slug]/game/ws-auth.ts`

- [ ] **Step 1: Delete files**

```bash
rm -rf supabase/functions/game-session
rm app/campaign/\[slug\]/game/ws-auth.ts
```

- [ ] **Step 2: Remove ws-auth import from GameClient.tsx**

In `app/campaign/[slug]/game/GameClient.tsx`, remove:
```typescript
import { buildGameSessionSocketConfig } from './ws-auth';
```

- [ ] **Step 3: Run all tests to confirm nothing breaks**

```bash
yarn test
```

Expected: all passing (edge function tests are gone, new API route tests pass)

- [ ] **Step 4: Run build**

```bash
yarn build
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git rm -r supabase/functions/game-session
git rm "app/campaign/[slug]/game/ws-auth.ts"
git add app/campaign/\[slug\]/game/GameClient.tsx
git commit -m "chore: delete game-session edge function and ws-auth helper"
```

---

### Task 11: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update architecture table**

Replace the game narration row in the AI split table:

```markdown
| Game narration | Claude Sonnet 4.6 | `app/api/game-session/` |
```

- [ ] **Step 2: Replace Game session WebSocket section**

Replace the existing `### Game session WebSocket` section with:

```markdown
### Game session flow

Player actions go through `POST /api/game-session/[id]/action` (Next.js API route). Each action:
1. Checks `round_in_progress` — returns 409 if a round is running (action dropped)
2. Saves message to `messages` table (`processed: false`)
3. Sets `campaigns.next_round_at = NOW() + ROUND_DEBOUNCE_SECONDS` (debounce window)
4. Broadcasts the action via Supabase Realtime broadcast on `game:<campaignId>`
5. Uses Vercel `after` to schedule a background worker that sleeps `ROUND_DEBOUNCE_SECONDS`
   then calls `POST /api/game-session/[id]/round`

The round route (called by the `after()` worker or the start route):
1. Acquires `round_in_progress` lock (race-safe)
2. Checks self-cancelling debounce: if `next_round_at > NOW()`, a later action extended the timer
   — release lock and skip (the newer worker will fire instead)
3. Streams from Anthropic, broadcasting `chunk` events on `game:<campaignId>`
4. Saves narration to DB, broadcasts `narration` and `round:saved` events
5. Releases lock and resets `next_round_at = NULL`

`ROUND_DEBOUNCE_SECONDS` is a shared constant in `lib/game-session/config.ts` used by both
the action route (server) and the `DebounceTimer` UI component (client).

Clients subscribe to `game:<campaignId>` broadcast channel for all real-time events.
Initial messages are loaded via the server component on page load.
```

- [ ] **Step 3: Update Key Files table**

Replace game-session edge function entries with:

```markdown
| `app/api/game-session/[id]/action/route.ts` | Player action handler |
| `app/api/game-session/[id]/round/route.ts` | AI round handler (streaming) |
| `lib/game-session/prompt.ts` | GM system prompt builder |
| `lib/game-session/history.ts` | Conversation history reconstruction |
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for game-session Next.js API migration"
```

---

## Final Step: Push and open PR

- [ ] **Step 1: Run full test suite**

```bash
yarn test
```

Expected: all passing

- [ ] **Step 2: Create and push feature branch**

Implementation goes on a feature branch — the `plan/` branch holds only these docs.

```bash
git checkout -b feat/migrate-game-session-to-nextjs-api
git push -u origin feat/migrate-game-session-to-nextjs-api
```

- [ ] **Step 3: Open PR**

```bash
gh pr create \
  --title "feat: migrate game-session WebSocket to Next.js API + Realtime" \
  --body "$(cat <<'EOF'
## Summary

- Replaces Supabase Edge Function WebSocket server with stateless Next.js API routes
- Player actions via `POST /api/game-session/[id]/action`; self-cancelling debounce via `campaigns.next_round_at` + Vercel `after`
- AI streaming chunks delivered via Supabase Realtime broadcast (`game:<campaignId>`) instead of WebSocket
- Eliminates 1006 disconnects caused by Supabase Edge Function wall-clock/CPU limits
- `ROUND_DEBOUNCE_SECONDS` shared constant keeps server debounce and client `DebounceTimer` in sync

## Design doc

`docs/superpowers/specs/2026-03-10-migrate-game-session-to-nextjs-api-design.md`

## Test plan

- [ ] All Vitest unit tests pass (`yarn test`)
- [ ] `POST /action` returns 409 when round in progress (manual test)
- [ ] Transmit button disables on `round:started`, re-enables on `round:saved`
- [ ] Dropped action notice appears when sending during active round
- [ ] Opening narration fires immediately after campaign start (triggered via `after()`)
- [ ] Multi-player: all players receive chunks and narration simultaneously
- [ ] Reconnecting player sees current messages (loaded from DB on page load)
- [ ] Self-cancelling debounce: rapid actions delay the round, only the last worker fires

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
