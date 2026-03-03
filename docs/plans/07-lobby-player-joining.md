# PR 07: Lobby — Player Joining + Character Creation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the lobby page where authenticated players join a campaign, create their characters, and wait for the host to start the session. Covers the join API, character creation form, and static player list (realtime in PR 08).

**Architecture:** Players arrive at `/campaign/[id]/lobby` already authenticated via Supabase magic link (middleware ensures this). They submit a character creation form which calls `POST /api/campaign/[id]/join`. The route identifies the player via their Supabase auth `user_id` — no session tokens or localStorage needed. Host vs. player distinction is determined by comparing `auth.user.id` with `campaign.host_user_id`.

**Tech Stack:** Next.js App Router, Supabase auth (server-side), shadcn/ui

**Depends on:** PR 04

---

## Auth Pattern Reference

The project uses Supabase magic link auth. Middleware at `middleware.ts` already protects `/campaign/*` routes — users are always authenticated when they reach the lobby.

**Getting the current user in an API route:**
```typescript
import { createServerAuthClient } from '@/lib/supabase/server'

const supabase = createServerAuthClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
// user.id is the UUID to store in players.user_id
```

**Getting the current user in a client component:**
```typescript
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

const supabase = createBrowserSupabaseClient()
const { data: { user } } = await supabase.auth.getUser()
```

---

## Design System Reference

All UI follows the **Steampunk "The Foundry"** design system.
See: `docs/plans/2026-03-03-steampunk-design-system.md`

- **Lobby background:** Full atmospheric effect stack (soot + furnace underglow + smog drift + vignette).
- **Campaign info:** Iron Plate panel. Campaign name in `Pragati Narrow` display size, uppercase, `--brass` glow.
- **CharacterCreation form:** Copper Gauge Panel — `2px solid --copper`, inner amber glow. Inputs: `--iron` bg, `--gunmetal` border, `--brass` focus. Labels in `Share Tech Mono` uppercase `--copper`.
- **Player list:** Each card as Iron Plate panel. Username in `Rokkitt`, class in `Barlow Condensed` small-caps `--ash`. "Host" badge in `--brass`.
- **Share link:** `Share Tech Mono` URL. Ghost copy button.
- **"Start Session" button:** Primary — `--brass`, chamfered, hover → `--furnace`. Disabled: `--gunmetal` bg, `--ash` text, 50% opacity.
- **"Waiting for host..." message:** `Barlow Condensed`, italic, `--ash`, slow pulsing opacity.
- **Player count badge:** `Share Tech Mono`, `--amber` text, `--gunmetal` bg (e.g., `03 / 06`).

---

### Task 1: Build Player Join API Route

**Files:**
- Create: `app/api/campaign/[id]/join/route.ts`
- Create: `app/api/campaign/[id]/join/__tests__/route.test.ts`

**Spec:**

`POST /api/campaign/[id]/join`

No request body required for identity — player is identified by their Supabase auth session.

Request body (optional character details):
```json
{
  "character_name": "Gandalf the Grey",
  "character_class": "Wizard",
  "character_backstory": "A wandering wizard..."
}
```

Behavior:
1. Get authenticated user via `createServerAuthClient().auth.getUser()`
2. Return 401 if not authenticated (should never happen due to middleware, but be safe)
3. Validate campaign exists and status is `lobby` → 404 / 400
4. Check player count < 6 for this campaign → 409
5. Check user hasn't already joined this campaign (unique constraint on `campaign_id + user_id`) → 409
6. Insert player row: `user_id = user.id`, `is_host = false`, `username` from user metadata (`user.user_metadata.display_name ?? user.email`)
7. Return `{ player }` with status 201

Error responses:
- 401: not authenticated
- 404: campaign not found
- 400: campaign not in lobby status
- 409: already joined this campaign
- 409: campaign is full (6 players)

**Step 1: Write the failing tests**

Create `app/api/campaign/[id]/join/__tests__/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../route'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerAuthClient: vi.fn(() => ({
    auth: { getUser: mockGetUser }
  })),
  createServerSupabaseClient: vi.fn(() => ({ from: mockFrom }))
}))

function makeRequest(campaignId: string, body = {}) {
  return new NextRequest(`http://localhost/api/campaign/${campaignId}/join`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('POST /api/campaign/[id]/join', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest('camp-1'), { params: { id: 'camp-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', user_metadata: { display_name: 'Alice' } } } })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        })
      })
    })
    const res = await POST(makeRequest('camp-1'), { params: { id: 'camp-1' } })
    expect(res.status).toBe(404)
  })

  it('returns 400 when campaign is not in lobby status', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', user_metadata: { display_name: 'Alice' } } } })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'camp-1', status: 'active', host_user_id: 'host-1' }, error: null })
        })
      })
    })
    const res = await POST(makeRequest('camp-1'), { params: { id: 'camp-1' } })
    expect(res.status).toBe(400)
  })

  it('returns 409 when user already joined', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', user_metadata: { display_name: 'Alice' } } } })
    // campaign fetch returns lobby status
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'camp-1', status: 'lobby', host_user_id: 'host-1' }, error: null })
        })
      })
    })
    // existing player check returns a player
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'player-1' }, error: null })
          })
        })
      })
    })
    const res = await POST(makeRequest('camp-1'), { params: { id: 'camp-1' } })
    expect(res.status).toBe(409)
  })

  it('returns 409 when campaign is full', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-new', user_metadata: { display_name: 'Bob' } } } })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'camp-1', status: 'lobby', host_user_id: 'host-1' }, error: null })
        })
      })
    })
    // not already joined
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        })
      })
    })
    // player count = 6
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: Array(6).fill({}), error: null })
      })
    })
    const res = await POST(makeRequest('camp-1'), { params: { id: 'camp-1' } })
    expect(res.status).toBe(409)
  })

  it('returns 201 with player data on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'alice@test.com', user_metadata: { display_name: 'Alice' } } } })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'camp-1', status: 'lobby', host_user_id: 'host-1' }, error: null })
        })
      })
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        })
      })
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null })
      })
    })
    const mockInsertedPlayer = { id: 'player-new', user_id: 'user-1', username: 'Alice', is_host: false }
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockInsertedPlayer, error: null })
        })
      })
    })
    const res = await POST(makeRequest('camp-1', { character_name: 'Gandalf', character_class: 'Wizard' }), { params: { id: 'camp-1' } })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.player.user_id).toBe('user-1')
  })

  it('uses display_name from user metadata as username', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'alice@test.com', user_metadata: { display_name: 'Alice Wonder' } } } })
    // ... setup mocks for campaign + checks + insert
    // verify insert is called with username = 'Alice Wonder'
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'p1', username: 'Alice Wonder' }, error: null })
      })
    })
    mockFrom
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'camp-1', status: 'lobby', host_user_id: 'host-1' }, error: null }) }) }) })
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) }) })
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) })
      .mockReturnValueOnce({ insert: mockInsert })
    await POST(makeRequest('camp-1'), { params: { id: 'camp-1' } })
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'Alice Wonder' })
    )
  })
})
```

**Step 2: Run tests — verify they fail**

```bash
yarn test app/api/campaign/\[id\]/join/__tests__/route
```

Expected: FAIL — `Cannot find module '../route'`

**Step 3: Implement `app/api/campaign/[id]/join/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerAuthClient, createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authClient = createServerAuthClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabaseClient()
  const campaignId = params.id

  // 1. Fetch campaign
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, status, host_user_id')
    .eq('id', campaignId)
    .single()
  if (!campaign || campaignError) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }
  if (campaign.status !== 'lobby') {
    return NextResponse.json({ error: 'Campaign is not accepting players' }, { status: 400 })
  }

  // 2. Check not already joined
  const { data: existing } = await supabase
    .from('players')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'Already joined this campaign' }, { status: 409 })
  }

  // 3. Check player count
  const { data: players } = await supabase
    .from('players')
    .select('id')
    .eq('campaign_id', campaignId)
  if ((players?.length ?? 0) >= 6) {
    return NextResponse.json({ error: 'Campaign is full' }, { status: 409 })
  }

  // 4. Insert player
  const body = await request.json().catch(() => ({}))
  const username = user.user_metadata?.display_name ?? user.email ?? 'Adventurer'

  const { data: player, error: insertError } = await supabase
    .from('players')
    .insert({
      campaign_id: campaignId,
      user_id: user.id,
      username,
      is_host: false,
      character_name: body.character_name ?? null,
      character_class: body.character_class ?? null,
      character_backstory: body.character_backstory ?? null,
      hp: 20,
      max_hp: 20,
      status: 'active',
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: 'Failed to join' }, { status: 500 })
  }

  return NextResponse.json({ player }, { status: 201 })
}
```

**Step 4: Run tests — verify they pass**

```bash
yarn test app/api/campaign/\[id\]/join/__tests__/route
```

Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add app/api/campaign/\[id\]/join/
git commit -m "feat: POST /api/campaign/[id]/join with Supabase auth"
```

---

### Task 2: Build Character Creation Form

**Files:**
- Create: `components/campaign/CharacterCreation.tsx`

**Spec:**

Form fields:
- **Character Name** (text input, optional) — `character_name`
- **Character Class** (text input, optional) — `character_class`. Placeholder: "e.g., Warrior, Mage, Rogue, Healer..."
- **Character Backstory** (textarea, optional) — `character_backstory`. Placeholder: "Tell us about your character's past..."

Note: No "Your Name" field — the username comes from Supabase auth metadata automatically.

Behavior:
1. On submit: POST to `/api/campaign/[id]/join` with character details
2. On success: call `onJoined(player)` — parent handles state update
3. On error: display error message (campaign full, already joined, etc.)
4. Disable form while request is in flight

Props:
```typescript
interface Props {
  campaignId: string
  onJoined: (player: Player) => void
}
```

**Step 1: Implement component**

```typescript
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { Player } from '@/types'

interface Props {
  campaignId: string
  onJoined: (player: Player) => void
}

export function CharacterCreation({ campaignId, onJoined }: Props) {
  const [characterName, setCharacterName] = useState('')
  const [characterClass, setCharacterClass] = useState('')
  const [backstory, setBackstory] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaign/${campaignId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character_name: characterName || undefined,
          character_class: characterClass || undefined,
          character_backstory: backstory || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')
      onJoined(data.player)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="character-name" className="font-mono text-xs uppercase text-[--copper]">
          Character Name
        </Label>
        <Input
          id="character-name"
          value={characterName}
          onChange={(e) => setCharacterName(e.target.value)}
          placeholder="What do they call you?"
          disabled={isSubmitting}
        />
      </div>
      <div>
        <Label htmlFor="character-class" className="font-mono text-xs uppercase text-[--copper]">
          Character Class
        </Label>
        <Input
          id="character-class"
          value={characterClass}
          onChange={(e) => setCharacterClass(e.target.value)}
          placeholder="e.g., Warrior, Mage, Rogue, Healer..."
          disabled={isSubmitting}
        />
      </div>
      <div>
        <Label htmlFor="backstory" className="font-mono text-xs uppercase text-[--copper]">
          Backstory
        </Label>
        <Textarea
          id="backstory"
          value={backstory}
          onChange={(e) => setBackstory(e.target.value)}
          placeholder="Tell us about your character's past..."
          disabled={isSubmitting}
          rows={4}
        />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Joining...' : 'Join Campaign'}
      </Button>
    </form>
  )
}
```

**Step 2: Visual test**

- Visit lobby as authenticated user → form renders with 3 fields (no username field)
- Submit without character details → still joins (all fields optional)
- Submit with details → loading state → calls `onJoined` with player data
- If already joined → error message appears

**Step 3: Commit**

```bash
git add components/campaign/CharacterCreation.tsx
git commit -m "feat: character creation form component"
```

---

### Task 3: Build Lobby Page

**Files:**
- Modify: `app/campaign/[id]/lobby/page.tsx`

**Spec:**

The lobby page has two states based on whether the current user has already joined:

**State 1: Not joined**
- Show campaign info: name, cover image (if available), world description excerpt
- Show the `CharacterCreation` form
- Show current player count: "X/6 players"

**State 2: Joined**
- Show campaign info
- Show player list (all joined players, with host badge)
- Show "Share this link" with copy button
- If current user is the host: show "Start Session" button (disabled until ≥1 non-host player)
- If not host: show "Waiting for host to start the session..."

**Data loading (on mount):**
1. `GET /api/campaign/[id]` → fetch campaign + players
2. `supabase.auth.getUser()` → get current user
3. Determine `isJoined`: check if any player has `user_id === currentUser.id`
4. Determine `isHost`: check if `campaign.host_user_id === currentUser.id`
5. If `campaign.status !== 'lobby'` → redirect to `/campaign/[id]`

**Step 1: Install shadcn components**

```bash
npx shadcn@latest add separator badge avatar
```

**Step 2: Implement lobby page**

`app/campaign/[id]/lobby/page.tsx` — client component (`'use client'`).

Key state: `campaign`, `players`, `currentUser`, `isJoined`, `isHost`, `isLoading`.

```typescript
'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { CharacterCreation } from '@/components/campaign/CharacterCreation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Campaign, Player } from '@/types'

export default function LobbyPage() {
  const { id: campaignId } = useParams<{ id: string }>()
  const router = useRouter()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createBrowserSupabaseClient()
      const [campaignRes, userRes] = await Promise.all([
        fetch(`/api/campaign/${campaignId}`).then(r => r.json()),
        supabase.auth.getUser()
      ])
      if (campaignRes.campaign?.status !== 'lobby') {
        router.replace(`/campaign/${campaignId}`)
        return
      }
      setCampaign(campaignRes.campaign)
      setPlayers(campaignRes.players ?? [])
      setCurrentUserId(userRes.data.user?.id ?? null)
      setIsLoading(false)
    }
    load()
  }, [campaignId, router])

  if (isLoading || !campaign) return <div>Loading...</div>

  const isJoined = players.some(p => p.user_id === currentUserId)
  const isHost = campaign.host_user_id === currentUserId

  function handleJoined(player: Player) {
    setPlayers(prev => [...prev, player])
  }

  return (
    <main className="min-h-screen p-8">
      {/* Campaign info */}
      <div className="mb-8">
        <h1 className="font-display text-4xl uppercase text-[--brass]">{campaign.name}</h1>
        {campaign.world_description && (
          <p className="text-[--ash] mt-2 max-w-xl">{campaign.world_description.slice(0, 200)}...</p>
        )}
      </div>

      {!isJoined ? (
        <div className="max-w-md">
          <p className="text-[--steam] text-sm mb-4 font-mono">
            {players.length}/6 players joined
          </p>
          <CharacterCreation campaignId={campaignId} onJoined={handleJoined} />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Player list */}
          <div>
            <h2 className="font-heading text-xl text-[--brass] mb-4">
              Players <span className="text-[--ash] font-mono text-sm">{players.length}/6</span>
            </h2>
            <div className="space-y-2">
              {players.map(player => (
                <div key={player.id} className="flex items-center gap-3 p-3 rounded border border-[--gunmetal]">
                  <Avatar>
                    <AvatarImage src={player.character_image_url ?? undefined} />
                    <AvatarFallback>{player.username[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-heading text-[--steam]">{player.username}</p>
                    {player.character_class && (
                      <p className="text-xs text-[--ash] font-body">{player.character_class}</p>
                    )}
                  </div>
                  {player.user_id === campaign.host_user_id && (
                    <Badge variant="outline" className="ml-auto text-[--brass] border-[--brass]">Host</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Share link */}
          <div className="border border-[--copper] rounded p-4">
            <p className="text-xs font-mono text-[--copper] uppercase mb-2">Share this link</p>
            <p className="font-mono text-[--steam] text-sm break-all">
              {typeof window !== 'undefined' ? `${window.location.origin}/campaign/${campaignId}/lobby` : ''}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-[--brass]"
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/campaign/${campaignId}/lobby`)}
            >
              Copy Link
            </Button>
          </div>

          {/* Host controls / waiting */}
          {isHost ? (
            <Button
              className="w-full max-w-xs"
              disabled={players.filter(p => p.user_id !== campaign.host_user_id).length === 0}
              onClick={() => {/* Task 4 in PR 08 */}}
            >
              Start Session
            </Button>
          ) : (
            <p className="text-[--ash] italic font-body animate-pulse">
              Waiting for host to start the session...
            </p>
          )}
        </div>
      )}
    </main>
  )
}
```

**Step 3: Visual test**

- Visit `/campaign/[id]/lobby` as authenticated user (not yet joined) → shows join form
- Submit character form → player list appears, shows your character
- Open same URL in different authenticated browser → shows join form
- Second user joins → both see 2 players (no realtime yet — shows on refresh, fixed in PR 08)
- Host user sees "Start Session" button, disabled when alone
- Non-host sees "Waiting for host..."
- Share link copy works

**Step 4: Commit**

```bash
git add app/campaign/\[id\]/lobby/page.tsx
git commit -m "feat: lobby page with join form and player list"
```

---

### Task 4: Campaign Redirect Logic

**Files:**
- Modify: `app/campaign/[id]/page.tsx`

**Spec:**

The game room page (`/campaign/[id]`) redirects based on status:
- `lobby` → redirect to `/campaign/[id]/lobby`
- `active` → stay (game room — placeholder for now)
- `ended` → redirect to `/campaign/[id]/summary`

**Step 1: Implement redirect logic**

```typescript
'use client'
import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  useEffect(() => {
    fetch(`/api/campaign/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.campaign?.status === 'lobby') router.replace(`/campaign/${id}/lobby`)
        if (data.campaign?.status === 'ended') router.replace(`/campaign/${id}/summary`)
      })
  }, [id, router])

  return <div>Loading...</div>
}
```

**Step 2: Visual test**

- Visit `/campaign/[id]` where status is `lobby` → immediately redirected to lobby

**Step 3: Commit**

```bash
git add app/campaign/\[id\]/page.tsx
git commit -m "feat: campaign page redirect based on status"
```

---

## Testing Summary

| What | How | Tests |
|------|-----|-------|
| `POST /api/campaign/[id]/join` | Unit (vitest) | 6 tests: auth, not found, not lobby, already joined, full, success |
| CharacterCreation component | Visual/manual | Form submits, error display, loading state |
| Lobby page states | Visual/manual | Not joined → joined, host vs non-host views |
| Campaign redirect | Visual/manual | `/campaign/[id]` → lobby when status = lobby |

## Acceptance Criteria

- [ ] `POST /api/campaign/[id]/join` uses Supabase auth `user_id` (not session_token) — 6 tests passing
- [ ] Character creation form submits and shows player in list
- [ ] Lobby correctly identifies host vs player via `campaign.host_user_id`
- [ ] "Start Session" button visible only to host
- [ ] `/campaign/[id]` redirects to lobby when status is `lobby`
- [ ] `yarn build` succeeds
