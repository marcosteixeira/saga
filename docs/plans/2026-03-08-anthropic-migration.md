# Anthropic Migration — game-session Edge Function

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace OpenAI GPT-4.1 with Anthropic Claude Sonnet 4.6 in the game-session edge function, using prompt caching to avoid re-billing the full conversation history on every round.

**Architecture:** The `messages` table already stores the full conversation history. On each round, we load that history, reconstruct an Anthropic `messages[]` array, and add `cache_control: { type: "ephemeral" }` to the system prompt and last history message. This means only the new player actions are billed at full price. The `previous_response_id` / `last_response_id` chain approach is dropped entirely — we own the history.

**Tech Stack:** `npm:@anthropic-ai/sdk`, Anthropic Messages API (streaming), Supabase JS for history queries, Vitest for tests, Deno edge runtime.

---

## Key Concepts

### Conversation History Format

The DB stores `messages` rows with `type: 'action' | 'narration'`. We reconstruct the Anthropic message array like this:

```
user:      buildFirstCallInput()          ← synthetic, not in DB
assistant: opening narration              ← first narration row
user:      JSON.stringify([actions])      ← batched action rows (round 1)
assistant: round 1 narration             ← narration row
user:      JSON.stringify([actions])      ← batched action rows (round 2)
assistant: round 2 narration             ← narration row
...
```

Consecutive `action` rows between two `narration` rows are batched into a single user message (same format as today: `[{ playerName, content }]`).

Player names are resolved via a Supabase nested select: `.select('content, type, player_id, players(character_name, username)')`.

### Prompt Caching

```
system: [{ type: "text", text: <big system prompt>, cache_control: { type: "ephemeral" } }]
messages: [
  ...history,  ← last item gets cache_control: { type: "ephemeral" }
  { role: "user", content: <current actions> }  ← NOT cached (new each round)
]
```

Cache TTL is 5 minutes, refreshed on each hit. First round after 5min idle = cache miss (full bill). Active sessions = almost all reads (10% cost).

### `last_response_id` column

Used today for: (1) first-call race guard (`null → 'pending' → id`), (2) OpenAI chain ID. After migration: (1) still needed for race guard; (2) we set it to `'done'` on first-call success instead of an OpenAI response ID. Subsequent rounds don't touch it.

### Anthropic Streaming Events

```
event.type === 'content_block_delta'
  && event.delta.type === 'text_delta'
  → event.delta.text   // the chunk
```

No `newResponseId` equivalent — we simply don't return one.

---

## Task 1: Add Anthropic SDK mock + update vitest aliases

**Files:**
- Create: `supabase/functions/__mocks__/anthropic.ts`
- Modify: `vitest.config.ts`

**Step 1: Write the mock**

```typescript
// supabase/functions/__mocks__/anthropic.ts
export default class Anthropic {
  messages = {
    stream: vi.fn(),
  }
  constructor(_opts?: unknown) {}
}
```

Note: this is a minimal stub. Tests that exercise streaming will set up their own `vi.fn()` implementations.

**Step 2: Add alias to vitest.config.ts**

In the `resolve.alias` block, add:

```typescript
'npm:@anthropic-ai/sdk': path.resolve(__dirname, 'supabase/functions/__mocks__/anthropic.ts'),
```

**Step 3: Run the full test suite to confirm nothing broke**

```bash
yarn test
```

Expected: all existing tests pass (no new tests yet, just alias wired up).

**Step 4: Commit**

```bash
git add supabase/functions/__mocks__/anthropic.ts vitest.config.ts
git commit -m "test: add Anthropic SDK mock and vitest alias"
```

---

## Task 2: Update `stream.ts` for Anthropic streaming events

**Files:**
- Modify: `supabase/functions/game-session/stream.ts`
- Modify: `supabase/functions/game-session/__tests__/stream.test.ts`

**Step 1: Write failing tests for new event format**

Replace the full content of `stream.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { consumeStream, type StreamEvent } from '../stream.ts'

async function* makeStream(events: StreamEvent[]): AsyncIterable<StreamEvent> {
  for (const event of events) {
    yield event
  }
}

describe('consumeStream', () => {
  it('broadcasts text chunks from content_block_delta events', async () => {
    const onChunk = vi.fn()
    const onChunkLog = vi.fn()
    const stream = makeStream([
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'The tavern' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: ' fills with smoke.' } },
      { type: 'message_stop' },
    ])

    const result = await consumeStream('campaign-1', stream, onChunk, onChunkLog, false)

    expect(onChunk).toHaveBeenCalledTimes(2)
    expect(onChunk).toHaveBeenNthCalledWith(1, 'campaign-1', 'The tavern')
    expect(onChunk).toHaveBeenNthCalledWith(2, 'campaign-1', ' fills with smoke.')
    expect(result).toEqual({ fullText: 'The tavern fills with smoke.' })
  })

  it('suppresses chunk broadcasts when silent is true', async () => {
    const onChunk = vi.fn()
    const onChunkLog = vi.fn()
    const stream = makeStream([
      { type: 'content_block_delta', delta: { type: 'text_delta', text: '{"world_context":' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: '"x"}' } },
      { type: 'message_stop' },
    ])

    const result = await consumeStream('campaign-2', stream, onChunk, onChunkLog, true)

    expect(onChunk).not.toHaveBeenCalled()
    expect(result).toEqual({ fullText: '{"world_context":"x"}' })
  })

  it('ignores non-text delta events', async () => {
    const onChunk = vi.fn()
    const onChunkLog = vi.fn()
    const stream = makeStream([
      { type: 'message_start' },
      { type: 'content_block_start' },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello.' } },
      { type: 'ping' },
      { type: 'content_block_stop' },
      { type: 'message_stop' },
    ])

    const result = await consumeStream('campaign-3', stream, onChunk, onChunkLog, false)

    expect(onChunk).toHaveBeenCalledTimes(1)
    expect(result.fullText).toBe('Hello.')
  })
})
```

**Step 2: Run tests to confirm they fail**

```bash
yarn test supabase/functions/game-session/__tests__/stream.test.ts
```

Expected: FAIL — current `stream.ts` uses `response.output_text.delta` events.

**Step 3: Update `stream.ts`**

Replace the full content:

```typescript
export type StreamEvent = {
  type: string
  delta?: {
    type: string
    text?: string
  }
}

export async function consumeStream(
  campaignId: string,
  stream: AsyncIterable<StreamEvent>,
  onChunk: (campaignId: string, chunk: string) => void,
  onChunkLog: (campaignId: string, chunkLength: number) => void,
  silent = false,
): Promise<{ fullText: string }> {
  let fullText = ""
  let chunkCount = 0

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta?.type === "text_delta" &&
      event.delta.text
    ) {
      fullText += event.delta.text
      if (!silent) {
        onChunk(campaignId, event.delta.text)
      }
      chunkCount++
      if (chunkCount % 20 === 0) {
        onChunkLog(campaignId, event.delta.text.length)
      }
    }
  }

  return { fullText }
}
```

**Step 4: Run tests to confirm they pass**

```bash
yarn test supabase/functions/game-session/__tests__/stream.test.ts
```

Expected: all 3 tests PASS.

**Step 5: Commit**

```bash
git add supabase/functions/game-session/stream.ts supabase/functions/game-session/__tests__/stream.test.ts
git commit -m "feat: update stream.ts for Anthropic content_block_delta events"
```

---

## Task 3: Add `loadHistory` function + tests

**Files:**
- Create: `supabase/functions/game-session/history.ts`
- Create: `supabase/functions/game-session/__tests__/history.test.ts`

**Step 1: Write the failing tests**

```typescript
// supabase/functions/game-session/__tests__/history.test.ts
import { describe, it, expect } from 'vitest'
import { buildMessageHistory } from '../history.ts'
import { buildFirstCallInput } from '../prompt.ts'

// Simulate DB rows as returned by Supabase nested select
interface MsgRow {
  content: string
  type: 'action' | 'narration'
  players: { character_name: string | null; username: string | null } | null
}

describe('buildMessageHistory', () => {
  it('returns empty array when no messages', () => {
    expect(buildMessageHistory([])).toEqual([])
  })

  it('wraps opening narration with first-call user message', () => {
    const rows: MsgRow[] = [
      { type: 'narration', content: 'The story begins.', players: null },
    ]
    const history = buildMessageHistory(rows)
    expect(history).toHaveLength(2)
    expect(history[0]).toEqual({ role: 'user', content: buildFirstCallInput() })
    expect(history[1]).toEqual({ role: 'assistant', content: 'The story begins.' })
  })

  it('batches consecutive actions into a single user message', () => {
    const rows: MsgRow[] = [
      { type: 'narration', content: 'Opening.', players: null },
      { type: 'action', content: 'I draw my sword.', players: { character_name: 'Aria', username: null } },
      { type: 'action', content: 'I raise my shield.', players: { character_name: 'Brom', username: null } },
      { type: 'narration', content: 'Round 1 narration.', players: null },
    ]
    const history = buildMessageHistory(rows)
    // user(firstCall), assistant(opening), user(batch), assistant(round1)
    expect(history).toHaveLength(4)
    expect(history[2].role).toBe('user')
    const batch = JSON.parse(history[2].content as string)
    expect(batch).toHaveLength(2)
    expect(batch[0]).toEqual({ playerName: 'Aria', content: 'I draw my sword.' })
    expect(batch[1]).toEqual({ playerName: 'Brom', content: 'I raise my shield.' })
    expect(history[3]).toEqual({ role: 'assistant', content: 'Round 1 narration.' })
  })

  it('falls back to username when character_name is null', () => {
    const rows: MsgRow[] = [
      { type: 'narration', content: 'Opening.', players: null },
      { type: 'action', content: 'I run.', players: { character_name: null, username: 'marcos' } },
      { type: 'narration', content: 'Narration.', players: null },
    ]
    const history = buildMessageHistory(rows)
    const batch = JSON.parse(history[2].content as string)
    expect(batch[0].playerName).toBe('marcos')
  })

  it('uses Unknown when both character_name and username are null', () => {
    const rows: MsgRow[] = [
      { type: 'narration', content: 'Opening.', players: null },
      { type: 'action', content: 'I act.', players: null },
      { type: 'narration', content: 'Narration.', players: null },
    ]
    const history = buildMessageHistory(rows)
    const batch = JSON.parse(history[2].content as string)
    expect(batch[0].playerName).toBe('Unknown')
  })

  it('handles multiple rounds correctly', () => {
    const rows: MsgRow[] = [
      { type: 'narration', content: 'Opening.', players: null },
      { type: 'action', content: 'Act 1.', players: { character_name: 'Aria', username: null } },
      { type: 'narration', content: 'Round 1.', players: null },
      { type: 'action', content: 'Act 2.', players: { character_name: 'Aria', username: null } },
      { type: 'narration', content: 'Round 2.', players: null },
    ]
    const history = buildMessageHistory(rows)
    // user(firstCall), assistant(opening), user(batch1), assistant(r1), user(batch2), assistant(r2)
    expect(history).toHaveLength(6)
    expect(history[4].role).toBe('user')
    expect(history[5]).toEqual({ role: 'assistant', content: 'Round 2.' })
  })
})
```

**Step 2: Run to confirm they fail**

```bash
yarn test supabase/functions/game-session/__tests__/history.test.ts
```

Expected: FAIL — `history.ts` doesn't exist yet.

**Step 3: Implement `history.ts`**

```typescript
// supabase/functions/game-session/history.ts
import { buildFirstCallInput } from './prompt.ts'

export interface MsgRow {
  content: string
  type: 'action' | 'narration'
  players: { character_name: string | null; username: string | null } | null
}

export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string
}

export function buildMessageHistory(rows: MsgRow[]): AnthropicMessage[] {
  if (!rows.length) return []

  const history: AnthropicMessage[] = []
  let actionBatch: Array<{ playerName: string; content: string }> = []

  for (const row of rows) {
    if (row.type === 'narration') {
      if (history.length === 0) {
        // First narration: prepend the synthetic first-call user message
        history.push({ role: 'user', content: buildFirstCallInput() })
      } else if (actionBatch.length > 0) {
        history.push({ role: 'user', content: JSON.stringify(actionBatch) })
        actionBatch = []
      }
      history.push({ role: 'assistant', content: row.content })
    } else if (row.type === 'action') {
      const playerName =
        row.players?.character_name ?? row.players?.username ?? 'Unknown'
      actionBatch.push({ playerName, content: row.content })
    }
  }

  return history
}
```

**Step 4: Run tests to confirm they pass**

```bash
yarn test supabase/functions/game-session/__tests__/history.test.ts
```

Expected: all 6 tests PASS.

**Step 5: Commit**

```bash
git add supabase/functions/game-session/history.ts supabase/functions/game-session/__tests__/history.test.ts
git commit -m "feat: add buildMessageHistory for Anthropic conversation reconstruction"
```

---

## Task 4: Update `index.ts` — replace OpenAI client with Anthropic

**Files:**
- Modify: `supabase/functions/game-session/index.ts`
- Modify: `supabase/functions/game-session/__tests__/index.test.ts`

This is a targeted swap: OpenAI import → Anthropic import, env var, client instantiation. No logic changes yet (runFirstCall and runRound updated in Tasks 5 & 6).

**Step 1: Update the env stub in `index.test.ts`**

Replace `OPENAI_API_KEY: 'openai-key'` with `ANTHROPIC_API_KEY: 'anthropic-key'`:

```typescript
const env: Record<string, string> = {
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  SUPABASE_ANON_KEY: 'anon-key',
  ANTHROPIC_API_KEY: 'anthropic-key',
}
```

**Step 2: Run existing index tests to confirm they still pass**

```bash
yarn test supabase/functions/game-session/__tests__/index.test.ts
```

Expected: PASS (no real behavior changed yet).

**Step 3: Update imports and client in `index.ts`**

Replace:
```typescript
import OpenAI from "npm:openai"
// ...
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!
const openai = new OpenAI({ apiKey: openaiApiKey })
```

With:
```typescript
import Anthropic from "npm:@anthropic-ai/sdk"
// ...
const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY")!
const anthropic = new Anthropic({ apiKey: anthropicApiKey })
```

Also add the history import at the top:
```typescript
import { buildMessageHistory, type MsgRow } from "./history.ts"
```

**Step 4: Run full test suite**

```bash
yarn test
```

Expected: all pass (runFirstCall/runRound not yet updated, but tests don't cover them directly).

**Step 5: Commit**

```bash
git add supabase/functions/game-session/index.ts supabase/functions/game-session/__tests__/index.test.ts
git commit -m "feat: swap OpenAI client for Anthropic in game-session index"
```

---

## Task 5: Update `runFirstCall` to use Anthropic

**Files:**
- Modify: `supabase/functions/game-session/index.ts`

The first call sends `buildFirstCallInput()` as the user message and expects a JSON response. The system prompt is sent with `cache_control` so it's cached for subsequent rounds.

**Step 1: Replace the `rawStream` block in `runFirstCall`**

Find this block:
```typescript
const rawStream = await openai.responses.create({
  model: "gpt-4.1",
  instructions: systemPrompt,
  input,
  stream: true,
} as Parameters<typeof openai.responses.create>[0])

const { fullText, newResponseId } = await consumeStream(...)
```

Replace with:
```typescript
const rawStream = anthropic.messages.stream({
  model: "claude-sonnet-4-6",
  max_tokens: 2048,
  system: [{ type: "text" as const, text: systemPrompt, cache_control: { type: "ephemeral" as const } }],
  messages: [{ role: "user" as const, content: input }],
})

const { fullText } = await consumeStream(
  campaignId,
  rawStream as AsyncIterable<StreamEvent>,
  (campaignId, chunk) => broadcastToAll(campaignId, { type: "chunk", content: chunk }),
  (campaignId, chunkLength) => logInfo("game_session.openai_stream_chunk", { campaignId, chunkLength }),
  true,
)
```

**Step 2: Remove `newResponseId` usage in `runFirstCall`**

The block that does:
```typescript
await supabase
  .from("campaigns")
  .update({ last_response_id: newResponseId })
  .eq("id", campaignId)
```

Change `newResponseId` to `"done"`:
```typescript
await supabase
  .from("campaigns")
  .update({ last_response_id: "done" })
  .eq("id", campaignId)
```

**Step 3: Run full test suite**

```bash
yarn test
```

Expected: all pass.

**Step 4: Commit**

```bash
git add supabase/functions/game-session/index.ts
git commit -m "feat: migrate runFirstCall to Anthropic messages API with prompt caching"
```

---

## Task 6: Update `runRound` to use Anthropic with history + caching

**Files:**
- Modify: `supabase/functions/game-session/index.ts`

This is the most important task. Load history from DB, add cache_control to last history message, call Anthropic.

**Step 1: Replace the history + OpenAI call block in `runRound`**

Find the section that builds `input` and calls `openai.responses.create`. Replace from after `const playerNameMap = ...` down through `consumeStream`:

```typescript
// Load full conversation history for this campaign
const { data: historyRows, error: historyError } = await supabase
  .from("messages")
  .select("content, type, players(character_name, username)")
  .eq("campaign_id", campaignId)
  .in("type", ["action", "narration"])
  .eq("processed", true)
  .order("created_at", { ascending: true })

if (historyError) throw historyError

const history = buildMessageHistory((historyRows ?? []) as MsgRow[])

// Build current round user message
const currentInput = JSON.stringify(
  claimedActions.map((a) => ({
    playerName: playerNameMap.get(a.player_id ?? "") ?? "Unknown",
    content: a.content,
  }))
)

// Apply cache breakpoint to last history message (caches everything before it)
const messagesWithCache = history.map((msg, i) => {
  if (i === history.length - 1 && history.length > 0) {
    return {
      ...msg,
      content: [{ type: "text" as const, text: msg.content as string, cache_control: { type: "ephemeral" as const } }],
    }
  }
  return msg
})

const allMessages = [
  ...messagesWithCache,
  { role: "user" as const, content: currentInput },
]

const { data: world, error: worldError } = await supabase
  .from("worlds")
  .select("world_content")
  .eq("id", (await supabase.from("campaigns").select("world_id").eq("id", campaignId).single()).data?.world_id)
  .single()

if (worldError) throw worldError

const { data: allPlayers, error: allPlayersError } = await supabase
  .from("players")
  .select("character_name, character_class, character_backstory, username")
  .eq("campaign_id", campaignId)

if (allPlayersError) throw allPlayersError

const systemPrompt = buildGMSystemPrompt(world?.world_content as string, allPlayers ?? [])

const rawStream = anthropic.messages.stream({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: [{ type: "text" as const, text: systemPrompt, cache_control: { type: "ephemeral" as const } }],
  messages: allMessages,
})

const { fullText } = await consumeStream(
  campaignId,
  rawStream as AsyncIterable<StreamEvent>,
  (campaignId, chunk) => broadcastToAll(campaignId, { type: "chunk", content: chunk }),
  (campaignId, chunkLength) => logInfo("game_session.openai_stream_chunk", { campaignId, chunkLength }),
)
```

**Step 2: Remove `last_response_id` update from `runRound`**

Delete the block:
```typescript
await supabase
  .from("campaigns")
  .update({ last_response_id: newResponseId })
  .eq("id", campaignId)
```

`runRound` no longer touches `last_response_id`.

**Step 3: Update `logInfo` for openai_call_started in `runRound`** — remove `previousResponseId` from the log meta:

```typescript
logInfo("game_session.openai_call_started", {
  campaignId,
  pendingCount: claimedActions.length,
  historyLength: history.length,
})
```

**Step 4: Run full test suite**

```bash
yarn test
```

Expected: all pass.

**Step 5: Commit**

```bash
git add supabase/functions/game-session/index.ts
git commit -m "feat: migrate runRound to Anthropic with history loading and prompt caching"
```

---

## Task 7: Rename `openai.ts` → `anthropic.ts`, update references

`extractNarration` is model-agnostic (parses JSON). Renaming removes the misleading OpenAI reference.

**Files:**
- Rename: `supabase/functions/game-session/openai.ts` → `supabase/functions/game-session/anthropic.ts`
- Rename: `supabase/functions/game-session/__tests__/openai.test.ts` → `supabase/functions/game-session/__tests__/anthropic.test.ts`
- Modify: `supabase/functions/game-session/index.ts` (update import)

**Step 1: Rename files**

```bash
mv supabase/functions/game-session/openai.ts supabase/functions/game-session/anthropic.ts
mv supabase/functions/game-session/__tests__/openai.test.ts supabase/functions/game-session/__tests__/anthropic.test.ts
```

**Step 2: Update import in `index.ts`**

```typescript
// Before:
import { extractNarration } from "./openai.ts"
// After:
import { extractNarration } from "./anthropic.ts"
```

**Step 3: Update import in `anthropic.test.ts`**

```typescript
// Before:
import { extractNarration } from '../openai.ts'
// After:
import { extractNarration } from '../anthropic.ts'
```

**Step 4: Run full test suite**

```bash
yarn test
```

Expected: all pass.

**Step 5: Commit**

```bash
git add -A supabase/functions/game-session/
git commit -m "refactor: rename openai.ts → anthropic.ts, update imports"
```

---

## Task 8: Deploy and smoke test

**Step 1: Deploy the edge function**

Use the `redeploy-supabase-functions` skill or call `mcp__supabase__deploy_edge_function` for `game-session` with all updated files.

**Step 2: Start a new campaign game session and verify:**

- [ ] Opening narration generates (first call returns JSON, narration extracted and saved)
- [ ] Player action triggers a round after the 10s debounce
- [ ] Narration streams in real-time (chunks appear progressively)
- [ ] Language stays consistent (no English switch if world is Portuguese)
- [ ] Passive actions trigger escalation instead of more atmosphere

**Step 3: Check Supabase edge function logs for errors**

Look for `game_session.openai_call_failed` events. None should appear.

**Step 4: Commit if any hotfixes were needed during testing, then done.**

---

## Rollback Plan

If Anthropic is down or misbehaving, swap the model strings back to `gpt-4.1` and restore the OpenAI client. The DB history (`messages` table) is unchanged and compatible with either approach.
