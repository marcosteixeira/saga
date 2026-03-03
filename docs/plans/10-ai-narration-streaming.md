# PR 10: AI Narration + Streaming

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the core AI narration engine: Claude generates story narration via streaming, tokens are broadcast to all players via Supabase Realtime, and the MessageFeed renders text as it arrives token-by-token.

**Architecture:** The narration API route calls Claude with streaming enabled. As tokens arrive, they're batched (~100ms) and broadcast via Supabase Realtime to a channel `campaign:[id]:narration`. All subscribed clients receive chunks and append them to the MessageFeed in real-time. When the stream completes, the full narration is saved to the `messages` table.

**Tech Stack:** `@anthropic-ai/sdk` (streaming), Supabase Realtime (broadcast), Next.js API routes

**Depends on:** PR 09

---

### Task 1: Build GM System Prompt

**Files:**
- Create: `lib/prompts/gm-system.ts`
- Create: `lib/prompts/__tests__/gm-system.test.ts`

**Spec:**

```typescript
buildGMSystemPrompt(params: {
  worldMd: string
  charactersMd: string
  npcsMd: string
  locationsMd: string
  memoryMd: string
  systemDescription?: string
}): string
```

Returns the full GM system prompt as defined in DESIGN.md, with all memory files injected into their respective XML tags.

**Step 1: Write tests**

```typescript
describe('buildGMSystemPrompt', () => {
  it('includes all provided memory files in the prompt', () => {
    const result = buildGMSystemPrompt({
      worldMd: '# Dark Realm',
      charactersMd: '# Characters',
      npcsMd: '# NPCs',
      locationsMd: '# Locations',
      memoryMd: '# Memory',
    })
    expect(result).toContain('# Dark Realm')
    expect(result).toContain('# Characters')
    expect(result).toContain('<world>')
    expect(result).toContain('<player-characters>')
    expect(result).toContain('<known-npcs>')
    expect(result).toContain('<campaign-summary>')
  })

  it('includes system_description when provided', () => {
    const result = buildGMSystemPrompt({
      worldMd: '', charactersMd: '', npcsMd: '',
      locationsMd: '', memoryMd: '',
      systemDescription: 'No magic allowed'
    })
    expect(result).toContain('No magic allowed')
  })

  it('omits system_description section when not provided', () => {
    const result = buildGMSystemPrompt({
      worldMd: '', charactersMd: '', npcsMd: '',
      locationsMd: '', memoryMd: '',
    })
    expect(result).not.toContain('undefined')
  })

  it('includes narration, mechanics, and memory rules', () => {
    const result = buildGMSystemPrompt({
      worldMd: '', charactersMd: '', npcsMd: '',
      locationsMd: '', memoryMd: '',
    })
    expect(result).toContain('narration-rules')
    expect(result).toContain('mechanics-rules')
    expect(result).toContain('memory-rules')
    expect(result).toContain('MEMORY_UPDATE')
    expect(result).toContain('GENERATE_IMAGE')
  })
})
```

4 test cases.

**Step 2: Run tests — fail**

**Step 3: Implement**

Pure string template function. Follow the exact prompt structure from DESIGN.md.

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: GM system prompt builder"
```

---

### Task 2: Build Narration API Route (Streaming)

**Files:**
- Create: `app/api/campaign/[id]/narrate/route.ts`
- Create: `app/api/campaign/[id]/narrate/__tests__/route.test.ts`

**Spec:**

`POST /api/campaign/[id]/narrate`

Request body:
```json
{
  "messages": [
    { "role": "user", "content": "Gandalf: I cast fireball at the goblins" },
    { "role": "user", "content": "Aragorn: I charge with my sword" }
  ]
}
```

The `messages` array contains the player actions formatted as conversation messages. The route prepends the conversation history from the current session.

Behavior:
1. Validate campaign exists and status is `active`
2. Fetch all campaign memory files
3. Build GM system prompt from memory files
4. Fetch recent message history (last N messages from current session, converted to Claude message format)
5. Call Claude with streaming: `anthropic.messages.stream()`
6. As tokens arrive:
   a. Buffer tokens for ~100ms
   b. Broadcast batch via Supabase Realtime to channel `campaign:{id}:narration`
   c. Broadcast payload: `{ type: 'chunk', content: 'token text', messageId: 'temp-id' }`
7. When stream completes:
   a. Broadcast `{ type: 'done', messageId: 'temp-id' }`
   b. Save full narration text to `messages` table (type: 'narration', player_id: null)
   c. Return `{ messageId: saved-message-id }` with status 200

Broadcast channel format: `campaign:{id}:narration`

Broadcast event payloads:
```typescript
// During streaming
{ type: 'chunk', content: string, messageId: string }

// Stream complete
{ type: 'done', messageId: string, fullContent: string }
```

**Step 1: Write tests**

```typescript
describe('POST /api/campaign/[id]/narrate', () => {
  it('returns 404 when campaign not found', ...)
  it('returns 400 when campaign is not active', ...)
  it('builds GM system prompt from campaign files', ...)
  it('calls Claude with streaming and correct message history', ...)
  it('saves completed narration to messages table', ...)
  it('returns message ID on completion', ...)
})
```

6 test cases. Mock `anthropic.messages.stream()` to return a fake async iterator. Mock Supabase broadcast.

**Step 2: Run tests — fail**

**Step 3: Implement**

Key implementation details:
- Use `anthropic.messages.stream()` for streaming
- Buffer tokens: accumulate text for 100ms, then broadcast the batch
- Use `supabase.channel().send()` for broadcast (not Postgres changes — this is pure broadcast)
- After stream completes, save to DB

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: POST /api/campaign/[id]/narrate with streaming"
```

---

### Task 3: Build Narration Stream Consumer (Client)

**Files:**
- Create: `lib/use-narration-stream.ts` (React hook)

**Spec:**

```typescript
useNarrationStream(campaignId: string): {
  isStreaming: boolean
  streamingContent: string      // accumulated text during streaming
  streamingMessageId: string | null
}
```

This hook subscribes to the Supabase broadcast channel `campaign:{id}:narration` and accumulates streaming chunks:

1. On `chunk` event: append `content` to `streamingContent`
2. On `done` event: clear `streamingContent`, set `isStreaming = false`
3. The parent component is responsible for fetching the saved message after `done`

**Step 1: Implement the hook**

Use `useEffect` to subscribe/unsubscribe. Use `useState` for streaming state. Use `useCallback` for event handlers.

**Step 2: Manual test**

This is hard to unit test (Supabase Realtime). Test manually by triggering the narration API from another tab/tool and watching the hook update in the game room.

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: useNarrationStream hook for client-side stream consumption"
```

---

### Task 4: Integrate Streaming into MessageFeed

**Files:**
- Modify: `components/game/MessageFeed.tsx`
- Modify: `components/game/GameRoom.tsx`

**Spec:**

Update the GameRoom to use the narration stream hook:

1. `GameRoom` calls `useNarrationStream(campaignId)`
2. When `isStreaming` is true, append a "streaming message" to the MessageFeed:
   - Rendered as a narration message (serif, parchment)
   - Content updates in real-time as chunks arrive
   - Shows a typing indicator or cursor at the end
3. When streaming completes (`done` event):
   - Remove the streaming message
   - Re-fetch messages from the API to get the saved version (with correct ID and image_url if any)
4. MessageFeed scrolls to bottom during streaming

**Step 1: Update GameRoom to use the hook**

**Step 2: Update MessageFeed to render streaming message**

Add a special "streaming" message at the end of the message list when `isStreaming` is true. Use the `streamingContent` as its content.

**Step 3: Visual test (requires full stack running)**

- Trigger narration via API (curl or test script)
- Watch text appear token-by-token in the MessageFeed
- After stream completes, streaming message replaced by saved version
- Auto-scroll follows streaming text

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: live streaming narration in MessageFeed"
```

---

### Task 5: Build Message History Formatter

**Files:**
- Create: `lib/prompts/message-history.ts`
- Create: `lib/prompts/__tests__/message-history.test.ts`

**Spec:**

```typescript
formatMessageHistory(
  messages: Message[],
  players: Player[]
): Array<{ role: 'user' | 'assistant', content: string }>
```

Converts database messages into Claude conversation format:
- `narration` messages (player_id = null) → `{ role: 'assistant', content: narrationText }`
- `action` messages → `{ role: 'user', content: "PlayerName: actionText" }`
- `system` messages → skip (not sent to Claude)
- `ooc` messages → skip (not sent to Claude)

Multiple consecutive actions from different players should be combined into a single user message:
```
"Gandalf: I cast fireball\nAragorn: I charge forward"
```

**Step 1: Write tests**

```typescript
describe('formatMessageHistory', () => {
  it('converts narration to assistant messages', ...)
  it('converts actions to user messages with player names', ...)
  it('combines consecutive actions into one user message', ...)
  it('skips system and ooc messages', ...)
  it('handles empty message list', ...)
  it('alternates user/assistant correctly for Claude', ...)
})
```

6 test cases.

**Step 2: Run tests — fail**

**Step 3: Implement**

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: message history formatter for Claude conversation"
```

---

## Testing Strategy

| What | How | Detail |
|------|-----|--------|
| buildGMSystemPrompt | Unit test (vitest) | 4 tests: file injection, system description, rules |
| formatMessageHistory | Unit test (vitest) | 6 tests: conversion, combining, skipping, alternation |
| POST /api/campaign/[id]/narrate | Unit test (vitest) | 6 tests: validation, Claude call, DB save |
| useNarrationStream hook | Manual | Trigger narration, watch streaming in browser |
| End-to-end streaming | Manual | Full flow: API trigger → tokens broadcast → live UI |
| MessageFeed streaming | Visual/manual | Token-by-token rendering, auto-scroll, typing indicator |

---

## Acceptance Criteria

- [ ] GM system prompt built correctly from campaign memory files (4 tests passing)
- [ ] Message history formatted for Claude conversation (6 tests passing)
- [ ] Narration API streams tokens via Supabase broadcast (6 tests passing)
- [ ] Client receives and displays streaming text token-by-token
- [ ] Completed narration saved to messages table
- [ ] MessageFeed auto-scrolls during streaming
- [ ] Streaming indicator visible during narration
- [ ] `yarn build` succeeds
