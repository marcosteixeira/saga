# Lobby Page Real Data Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all mock data in the lobby page with real data fetched from the existing `/api/campaign/[id]` endpoint.

**Architecture:** Convert `LobbyPage` from a fully client-side component with hardcoded mocks into a Next.js Server Component that fetches campaign+world+players data at render time, then passes it as props to a `LobbyClient` client component that retains the existing interactive UI state.

**Tech Stack:** Next.js 14 App Router (Server Components + Client Components), TypeScript, existing `/api/campaign/[id]` route, existing `Campaign`, `Player`, `World` types.

---

## What changes

| Currently hardcoded | Real source |
|---------------------|-------------|
| `MOCK_CAMPAIGN.name` | `campaign.name` |
| `MOCK_CAMPAIGN.worldDescription` | `world.description` |
| `MOCK_CAMPAIGN.hostUsername` | `campaign.host_username` |
| `MOCK_WORLD_CLASSES` (6 items) | `world.classes` (JSONB array) |
| `INITIAL_PLAYERS` (3 fake users) | `players[]` from DB |
| `currentUser` (always `players[0]`) | The player whose `user_id` matches the session (or any player if unauthenticated for now) |

**Scope:** Read-only. No mutations yet (save/ready/start-game wire-up is a separate plan). The form and interaction remain but save buttons stay local/no-op for now.

---

### Task 1: Create a server component wrapper for the lobby page

**Files:**
- Modify: `app/campaign/[id]/lobby/page.tsx`
- Create: `app/campaign/[id]/lobby/LobbyClient.tsx`

**Step 1: Extract the entire current `page.tsx` content into `LobbyClient.tsx`**

Move everything from `app/campaign/[id]/lobby/page.tsx` into a new file `app/campaign/[id]/lobby/LobbyClient.tsx`.

The new file should:
1. Keep the `'use client'` directive at the top
2. Keep all existing types, sub-components, and the main component
3. Rename the default export from `LobbyPage` to `LobbyClient`
4. Accept props instead of using mock data (see Task 2)

**Step 2: Verify the file compiles**

Run: `yarn tsc --noEmit`
Expected: No errors (you haven't changed behavior yet, just moved code)

**Step 3: Commit**

```bash
git add app/campaign/[id]/lobby/LobbyClient.tsx
git commit -m "refactor: extract lobby UI into LobbyClient component"
```

---

### Task 2: Define and wire real props into LobbyClient

**Files:**
- Modify: `app/campaign/[id]/lobby/LobbyClient.tsx`

The `LobbyClient` component should receive real data as props and use it instead of the mock constants.

**Step 1: Add prop types and update component signature**

At the top of `LobbyClient.tsx`, after the existing `WorldClass` type, add:

```typescript
import type { Campaign } from '@/types/campaign'
import type { Player } from '@/types/player'
import type { World } from '@/types/world'

interface LobbyClientProps {
  campaign: Campaign
  world: World
  players: Player[]
  currentUserId: string | null
}
```

Change the function signature:

```typescript
export default function LobbyClient({ campaign, world, players, currentUserId }: LobbyClientProps) {
```

**Step 2: Replace mock data references**

Inside `LobbyClient`, make the following substitutions:

1. Remove `MOCK_CAMPAIGN`, `MOCK_WORLD_CLASSES`, and `INITIAL_PLAYERS` constants entirely.

2. Map DB `Player[]` to the local `Player` interface used by the UI. Add this mapping near the top of the component body (before state declarations):

```typescript
const uiPlayers: Player[] = players.map(p => ({
  id: p.id,
  username: p.username,
  characterName: p.character_name ?? '',
  characterClass: p.character_class ?? '',
  backstory: p.character_backstory ?? '',
  isHost: p.is_host,
  isCurrentUser: p.user_id === currentUserId,
  // Map DB status to UI status: treat any player with a saved character as 'not_ready'
  // (ready state is not yet persisted — that's a future plan)
  status: 'not_ready' as PlayerStatus,
}))
```

3. Replace `useState<(Player | null)[]>(INITIAL_PLAYERS)` with:

```typescript
const [uiPlayerState, setUiPlayerState] = useState<(Player | null)[]>(uiPlayers)
```

4. Replace every reference to `players` state with `uiPlayerState` and every setter call `setPlayers` with `setUiPlayerState`.

5. Replace the `currentUser` derivation:

```typescript
// Before:
const currentUser = players[0] as Player

// After:
const currentUser = uiPlayerState.find(p => p?.isCurrentUser) ?? uiPlayerState[0] as Player
```

6. Replace mock data references in JSX:

```typescript
// Campaign name
{MOCK_CAMPAIGN.name}  →  {campaign.name}

// World description
{MOCK_CAMPAIGN.worldDescription}  →  {world.description}

// Host username
@{MOCK_CAMPAIGN.hostUsername}  →  @{campaign.host_username}

// World classes grid
{MOCK_WORLD_CLASSES.map(...)}  →  {world.classes.map(...)}

// Selected class data
const selectedClassData = MOCK_WORLD_CLASSES.find(c => c.name === charClass)
→
const selectedClassData = world.classes.find(c => c.name === charClass)
```

**Step 3: Verify types compile**

Run: `yarn tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add app/campaign/[id]/lobby/LobbyClient.tsx
git commit -m "feat: wire real campaign/world/player props into LobbyClient"
```

---

### Task 3: Write the server component page that fetches data

**Files:**
- Modify: `app/campaign/[id]/lobby/page.tsx`

Replace the entire content of `page.tsx` with a server component that:
1. Fetches campaign data via the existing API route
2. Gets the current user session
3. Passes real data to `LobbyClient`

```typescript
import { notFound } from 'next/navigation'
import { createAuthServerClient } from '@/lib/supabase/server'
import LobbyClient from './LobbyClient'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LobbyPage({ params }: Props) {
  const { id } = await params

  // Fetch campaign data (reuse existing API route logic directly — no HTTP round-trip)
  const supabase = createAuthServerClient()

  // Get current session (may be null for unauthenticated users)
  const { data: { session } } = await supabase.auth.getSession()
  const currentUserId = session?.user?.id ?? null

  // Fetch all data in parallel
  const [campaignResult, playersResult] = await Promise.all([
    supabase.from('campaigns').select('*, worlds(*)').eq('id', id).single(),
    supabase.from('players').select('*').eq('campaign_id', id),
  ])

  if (campaignResult.error || !campaignResult.data) {
    notFound()
  }

  const { worlds: world, ...campaign } = campaignResult.data
  const players = playersResult.data ?? []

  if (!world) {
    // World not yet attached (shouldn't happen post-generation)
    notFound()
  }

  return (
    <LobbyClient
      campaign={campaign}
      world={world}
      players={players}
      currentUserId={currentUserId}
    />
  )
}
```

**Step 2: Verify the page builds**

Run: `yarn tsc --noEmit`
Expected: No errors

Run: `yarn build` or `yarn dev` and visit `/campaign/<real-id>/lobby`
Expected: Page renders with real campaign name, real world description, real world classes, real players

**Step 3: Commit**

```bash
git add app/campaign/[id]/lobby/page.tsx
git commit -m "feat: lobby page fetches and renders real campaign data"
```

---

### Task 4: Manual verification

**Step 1: Start dev server**

```bash
yarn dev
```

**Step 2: Verify with a real campaign**

1. Create or find an existing campaign in Supabase that has:
   - A linked world with `status = 'ready'` and `classes` populated
   - At least one player row

2. Visit `http://localhost:3000/campaign/<campaign-id>/lobby`

3. Check the following:
   - Campaign name in the header matches the DB row
   - World description paragraph matches `worlds.description`
   - Host username matches `campaigns.host_username`
   - Class picker shows exactly the 6 classes from `worlds.classes`
   - Crew manifest shows the real players (username, character name if saved, host badge)

**Step 3: Verify 404 behavior**

Visit `http://localhost:3000/campaign/nonexistent-id/lobby`
Expected: Next.js 404 page

---

## Out of scope (separate plans)

- Saving character changes to the DB
- Ready/not-ready persistence
- Realtime player list updates
- Start game action
- Auth-gated access (only campaign players can view)
