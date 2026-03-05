# Lobby Realtime Events Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a player saves their character or marks ready, all connected lobby clients see the update in real time — without a page refresh — and the host's Start Game button enables automatically when all players are ready.

**Architecture:** Two API routes (`PATCH /player`, `PATCH /ready`) broadcast a `player:updated` event via Supabase Realtime Broadcast after each successful DB write. `LobbyClient.tsx` subscribes to the `campaign:<id>` channel on mount and merges incoming player updates into local state.

**Tech Stack:** Supabase Realtime Broadcast REST API, Next.js 14 API routes, Supabase browser client (`createClient`), Vitest

---

## Task 1: Create `lib/realtime-broadcast.ts`

**Files:**
- Create: `lib/realtime-broadcast.ts`
- Create: `lib/__tests__/realtime-broadcast.test.ts`

A Node.js-compatible helper that POSTs to the Supabase Realtime Broadcast REST API. Called from API routes (not edge functions). Errors are swallowed so they never break the API response.

**Step 1: Write the failing tests**

Create `lib/__tests__/realtime-broadcast.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Must import AFTER stubbing fetch
const { broadcastPlayerUpdate } = await import('../realtime-broadcast')

const fakePlayer = {
  id: 'player-1',
  campaign_id: 'camp-1',
  user_id: 'user-1',
  username: 'testuser',
  character_name: 'Aldric',
  character_class: 'Warrior',
  character_backstory: null,
  is_ready: false,
  is_host: false,
  character_image_url: null,
  stats: { hp: 20, hp_max: 20 },
  status: 'active',
  absence_mode: 'skip',
  last_seen_at: '2026-01-01T00:00:00Z',
  joined_at: '2026-01-01T00:00:00Z',
}

describe('broadcastPlayerUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true, status: 200 })
    vi.stubEnv('SUPABASE_URL', 'https://abc.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('POSTs to the Supabase Realtime broadcast endpoint', async () => {
    await broadcastPlayerUpdate('camp-1', fakePlayer)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://abc.supabase.co/realtime/v1/api/broadcast',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sends correct channel topic, event, and full player payload', async () => {
    await broadcastPlayerUpdate('camp-1', fakePlayer)
    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body).toEqual({
      messages: [
        {
          topic: 'campaign:camp-1',
          event: 'player:updated',
          payload: fakePlayer,
        },
      ],
    })
  })

  it('includes apikey and Content-Type headers', async () => {
    await broadcastPlayerUpdate('camp-1', fakePlayer)
    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers['apikey']).toBe('service-role-key')
    expect(options.headers['Content-Type']).toBe('application/json')
  })

  it('does not throw when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('network error'))
    await expect(broadcastPlayerUpdate('camp-1', fakePlayer)).resolves.toBeUndefined()
  })

  it('does not throw when fetch returns non-ok status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })
    await expect(broadcastPlayerUpdate('camp-1', fakePlayer)).resolves.toBeUndefined()
  })
})
```

**Step 2: Run tests — verify they fail**

```bash
yarn vitest lib/__tests__/realtime-broadcast.test.ts --run
```

Expected: FAIL with "Cannot find module '../realtime-broadcast'"

**Step 3: Implement `lib/realtime-broadcast.ts`**

```typescript
import type { Player } from '@/types/player'

export async function broadcastPlayerUpdate(
  campaignId: string,
  player: Player
): Promise<void> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) return

    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `campaign:${campaignId}`,
            event: 'player:updated',
            payload: player,
          },
        ],
      }),
    })
  } catch {
    // Broadcast failures must never crash the API route
  }
}
```

**Step 4: Run tests — verify they pass**

```bash
yarn vitest lib/__tests__/realtime-broadcast.test.ts --run
```

Expected: 5 tests pass

**Step 5: Commit**

```bash
git add lib/realtime-broadcast.ts lib/__tests__/realtime-broadcast.test.ts
git commit -m "feat: add broadcastPlayerUpdate helper for Realtime Broadcast"
```

---

## Task 2: Broadcast from `PATCH /api/campaign/[id]/player`

**Files:**
- Modify: `app/api/campaign/[id]/player/route.ts`
- Modify: `app/api/campaign/[id]/player/__tests__/route.test.ts`

After a successful character save, broadcast the updated player to all lobby clients.

**Step 1: Add the failing test**

In `app/api/campaign/[id]/player/__tests__/route.test.ts`, add a mock for `@/lib/realtime-broadcast` at the top (alongside the existing `@/lib/supabase/server` mock):

```typescript
vi.mock('@/lib/realtime-broadcast', () => ({
  broadcastPlayerUpdate: vi.fn().mockResolvedValue(undefined),
}))

import { broadcastPlayerUpdate } from '@/lib/realtime-broadcast'
```

Then add this test to the existing `describe` block:

```typescript
it('calls broadcastPlayerUpdate with campaignId and updated player on success', async () => {
  ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  })
  const updatedPlayer = {
    id: 'player-1',
    user_id: 'user-123',
    campaign_id: 'abc',
    character_name: 'Arwen',
    character_class: 'Mage',
    character_backstory: null,
    is_ready: false,
  }
  const mockDb = {
    from: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: updatedPlayer, error: null }),
  }
  ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
  await PATCH(
    makeRequest({ character_name: 'Arwen', character_class: 'Mage' }),
    makeParams('abc')
  )
  expect(broadcastPlayerUpdate).toHaveBeenCalledWith('abc', updatedPlayer)
})

it('does not call broadcastPlayerUpdate when DB update fails', async () => {
  ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  })
  const mockDb = {
    from: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
  }
  ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
  await PATCH(
    makeRequest({ character_name: 'Arwen', character_class: 'Mage' }),
    makeParams('abc')
  )
  expect(broadcastPlayerUpdate).not.toHaveBeenCalled()
})
```

**Step 2: Run tests — verify new tests fail**

```bash
yarn vitest "app/api/campaign/\[id\]/player/__tests__/route.test.ts" --run
```

Expected: 2 new tests FAIL, existing 11 tests still pass.

**Step 3: Update `app/api/campaign/[id]/player/route.ts`**

Add the import at the top:

```typescript
import { broadcastPlayerUpdate } from '@/lib/realtime-broadcast'
```

Then, in the `PATCH` handler, after the successful update (before `return NextResponse.json({ player }...)`), add:

```typescript
  // Fire-and-forget — broadcast failure must not break the response
  void broadcastPlayerUpdate(campaignId, player)

  return NextResponse.json({ player }, { status: 200 })
```

**Step 4: Run tests — verify all pass**

```bash
yarn vitest "app/api/campaign/\[id\]/player/__tests__/route.test.ts" --run
```

Expected: 13 tests pass

**Step 5: Commit**

```bash
git add "app/api/campaign/[id]/player/route.ts" "app/api/campaign/[id]/player/__tests__/route.test.ts"
git commit -m "feat: broadcast player:updated after character save"
```

---

## Task 3: Broadcast from `PATCH /api/campaign/[id]/ready`

**Files:**
- Modify: `app/api/campaign/[id]/ready/route.ts`
- Modify: `app/api/campaign/[id]/ready/__tests__/route.test.ts`

After a successful ready toggle, broadcast the updated player to all lobby clients.

**Step 1: Add the failing tests**

In `app/api/campaign/[id]/ready/__tests__/route.test.ts`, add the mock at the top (alongside the existing one):

```typescript
vi.mock('@/lib/realtime-broadcast', () => ({
  broadcastPlayerUpdate: vi.fn().mockResolvedValue(undefined),
}))

import { broadcastPlayerUpdate } from '@/lib/realtime-broadcast'
```

Then add these tests to the existing `describe` block:

```typescript
it('calls broadcastPlayerUpdate with campaignId and updated player on success', async () => {
  ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  })
  const updatedPlayer = { ...playerWithCharacter, is_ready: true }
  let callCount = 0
  const mockDb = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve({ data: playerWithCharacter, error: null })
      return Promise.resolve({ data: updatedPlayer, error: null })
    }),
  }
  ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
  await PATCH(makeRequest({ is_ready: true }), makeParams('abc'))
  expect(broadcastPlayerUpdate).toHaveBeenCalledWith('abc', updatedPlayer)
})

it('does not call broadcastPlayerUpdate when DB update fails', async () => {
  ;(createAuthServerClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  })
  let callCount = 0
  const mockDb = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve({ data: playerWithCharacter, error: null })
      return Promise.resolve({ data: null, error: { code: 'WRITE_ERROR' } })
    }),
  }
  ;(createServerSupabaseClient as ReturnType<typeof vi.fn>).mockReturnValue(mockDb)
  await PATCH(makeRequest({ is_ready: true }), makeParams('abc'))
  expect(broadcastPlayerUpdate).not.toHaveBeenCalled()
})
```

**Step 2: Run tests — verify new tests fail**

```bash
yarn vitest "app/api/campaign/\[id\]/ready/__tests__/route.test.ts" --run
```

Expected: 2 new tests FAIL, existing 11 tests still pass.

**Step 3: Update `app/api/campaign/[id]/ready/route.ts`**

Add the import at the top:

```typescript
import { broadcastPlayerUpdate } from '@/lib/realtime-broadcast'
```

Then, in the `PATCH` handler, after the successful update (before `return NextResponse.json({ player }...)`), add:

```typescript
  // Fire-and-forget — broadcast failure must not break the response
  void broadcastPlayerUpdate(campaignId, player)

  return NextResponse.json({ player }, { status: 200 })
```

**Step 4: Run tests — verify all pass**

```bash
yarn vitest "app/api/campaign/\[id\]/ready/__tests__/route.test.ts" --run
```

Expected: 13 tests pass

**Step 5: Commit**

```bash
git add "app/api/campaign/[id]/ready/route.ts" "app/api/campaign/[id]/ready/__tests__/route.test.ts"
git commit -m "feat: broadcast player:updated after ready toggle"
```

---

## Task 4: Subscribe in `LobbyClient.tsx`

**Files:**
- Modify: `app/campaign/[id]/lobby/LobbyClient.tsx`

Add a `useEffect` that subscribes to `player:updated` broadcast events on mount and merges incoming player updates into local state. No unit test — verified manually with two browser tabs.

**Step 1: Add the import**

At the top of `LobbyClient.tsx`, add:

```typescript
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
```

Note: `useState` is already imported. Change `import { useState }` to `import { useState, useEffect }`.

**Step 2: Add the subscription `useEffect`**

Inside the `LobbyClient` component, after the existing state declarations, add:

```typescript
  useEffect(() => {
    const supabase = createClient()
    let mounted = true

    const channel = supabase
      .channel(`campaign:${campaign.id}`)
      .on('broadcast', { event: 'player:updated' }, ({ payload }: { payload: DBPlayer }) => {
        if (!mounted) return
        setPlayers((prev) =>
          prev.map((p) => {
            if (p.id !== payload.id) return p
            return {
              ...p,
              username: payload.username,
              characterName: payload.character_name ?? '',
              characterClass: payload.character_class ?? '',
              backstory: payload.character_backstory ?? '',
              status: (payload.is_ready ? 'ready' : 'not_ready') as PlayerStatus,
            }
          })
        )
      })
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [campaign.id])
```

**Step 3: Verify TypeScript compiles**

```bash
yarn tsc --noEmit
```

Expected: No TypeScript errors

**Step 4: Manual smoke test**

- Start dev server: `yarn dev`
- Open the lobby page in two browser tabs (both logged in as different users, or same user in incognito)
- In Tab 2: fill in character name + class → click "Save Character"
- Tab 1: player card in the roster updates to show the character name and class — without refreshing
- In Tab 2: click "I'm Ready"
- Tab 1: player card shows "Ready" badge; if all players are ready, "Start Game" button enables

**Step 5: Commit**

```bash
git add "app/campaign/[id]/lobby/LobbyClient.tsx"
git commit -m "feat: subscribe to player:updated broadcast in lobby"
```

---

## Task 5: Run all tests

**Step 1:**

```bash
yarn test
```

Expected: All existing tests pass + 12 new tests pass (5 broadcast helper + 2 per route × 2 routes... wait, 5 + 2 + 2 = 9 new tests)

**Step 2:** If any tests fail, read the error carefully and fix the failing test or implementation before proceeding.

**Step 3: Verify build**

```bash
yarn build
```

Expected: Build succeeds with no errors.

---

## Testing Summary

| What | How | Count |
|------|-----|-------|
| `broadcastPlayerUpdate` helper | Unit (vitest) | 5 tests |
| Broadcast called after character save | Unit (vitest) | 2 tests |
| Broadcast called after ready toggle | Unit (vitest) | 2 tests |
| Lobby realtime updates | Visual/manual — two tabs | — |
| Start Game auto-enables | Visual/manual — all mark ready | — |
