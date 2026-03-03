# PR 07: Lobby — Player Joining + Character Creation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the lobby page where players join a campaign, create their characters, and wait for the host to start the session. This PR covers the join API, character creation form, session token management, and static player list (realtime comes in PR 08).

**Architecture:** Players arrive at `/campaign/[id]` and get redirected to `/campaign/[id]/lobby` if the campaign status is `lobby`. They pick a username and create a character (name, class, backstory). A session token is generated and stored in localStorage to identify the player in future requests. The lobby displays campaign info and a list of joined players.

**Tech Stack:** Next.js, Supabase, shadcn/ui

**Depends on:** PR 04

---

## Design System Reference

All UI work in this PR must follow the **Steampunk "The Foundry"** design system.
See: `docs/plans/2026-03-03-steampunk-design-system.md`

**Applicable to this PR:**

- **Lobby page background:** Full layered background system (soot + furnace underglow + smog drift animation + vignette). This is a high-visibility page — use the full atmospheric effect stack.
- **Campaign info section:** Iron Plate panel with campaign name in `Pragati Narrow` display size, uppercase, `--brass` with glow text-shadow. Cover image (if available) with vignette overlay.
- **`CharacterCreation` form:** Copper Gauge Panel container (`2px solid --copper`, inner amber glow). Inputs: `--iron` bg, `--gunmetal` border, `--brass` focus glow. Labels in `Share Tech Mono` uppercase `--copper`.
- **Player list (joined state):** Each player card as a small Iron Plate panel. Avatar with circular crop and `--brass` border ring. Username in `Rokkitt`, class in `Barlow Condensed` small-caps `--ash`.
- **"Share this link" block:** Copper Gauge Panel with the URL in `Share Tech Mono`. Copy button as Ghost variant (`--brass` text + border, fills `--smog` on hover).
- **"Start Session" button:** Primary button — `--brass`, chamfered, hover → `--furnace`. Disabled state: `--gunmetal` bg, `--ash` text, 50% opacity.
- **"Waiting for host..." message:** `Barlow Condensed`, italic, `--ash`, small-caps. Optionally animate with a slow pulsing opacity (2s ease-in-out cycle).
- **Player count badge:** `Share Tech Mono`, `--amber` text, `--gunmetal` background — gauge readout style (e.g., `03 / 06`).

---

### Task 1: Build Player Join API Route

**Files:**
- Create: `app/api/campaign/[id]/join/route.ts`
- Create: `app/api/campaign/[id]/join/__tests__/route.test.ts`

**Spec:**

`POST /api/campaign/[id]/join`

Request body:
```json
{
  "username": "Gandalf",
  "character_name": "Gandalf the Grey",
  "character_class": "Wizard",
  "character_backstory": "A wandering wizard who..."
}
```

Behavior:
1. Validate campaign exists and status is `lobby`
2. Validate `username` is non-empty
3. Check player count < 6 for this campaign
4. Check username is unique within this campaign
5. Generate `session_token` (UUID) on the server
6. Insert player row with `is_host: false`
7. Return `{ player: { id, session_token, ... } }` with status 201

Error responses:
- 404: campaign not found
- 400: missing username
- 400: campaign not in lobby status
- 409: username already taken in this campaign
- 409: campaign is full (6 players)

**Step 1: Write tests**

```typescript
describe('POST /api/campaign/[id]/join', () => {
  it('returns 404 when campaign not found', ...)
  it('returns 400 when campaign status is not lobby', ...)
  it('returns 400 when username is empty', ...)
  it('returns 409 when username is taken', ...)
  it('returns 409 when campaign has 6 players', ...)
  it('returns 201 with player data on success', ...)
  it('generates a session_token for the player', ...)
})
```

7 test cases covering all error paths and success.

**Step 2: Run tests — fail**

**Step 3: Implement the route**

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: POST /api/campaign/[id]/join with validation"
```

---

### Task 2: Session Token Management

**Files:**
- Create: `lib/session.ts`
- Create: `lib/__tests__/session.test.ts`

**Spec:**

Client-side utilities for managing the session token in localStorage:

```typescript
// Store session token for a campaign
setSessionToken(campaignId: string, token: string): void

// Get session token for a campaign
getSessionToken(campaignId: string): string | null

// Get all session tokens (for identifying which campaigns user belongs to)
getAllSessionTokens(): Record<string, string>

// Clear session token for a campaign
clearSessionToken(campaignId: string): void
```

Storage format in localStorage:
- Key: `saga_sessions`
- Value: `{ "campaign-id-1": "token-abc", "campaign-id-2": "token-def" }`

This allows a single browser to be in multiple campaigns.

**Step 1: Write tests**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'

// Mock localStorage
const store: Record<string, string> = {}
beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k])
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val },
    removeItem: (key: string) => { delete store[key] },
  })
})

describe('session', () => {
  it('setSessionToken stores token for campaign', ...)
  it('getSessionToken retrieves stored token', ...)
  it('getSessionToken returns null for unknown campaign', ...)
  it('getAllSessionTokens returns all stored tokens', ...)
  it('clearSessionToken removes token for campaign', ...)
  it('handles multiple campaigns independently', ...)
})
```

6 test cases.

**Step 2: Run tests — fail**

**Step 3: Implement `lib/session.ts`**

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: session token management (lib/session.ts)"
```

---

### Task 3: Build Character Creation Form

**Files:**
- Create: `components/campaign/CharacterCreation.tsx`

**Spec:**

Form fields:
- **Your Name** (text input, required) — maps to `username`
- **Character Name** (text input, optional) — maps to `character_name`
- **Character Class** (text input, optional) — maps to `character_class`. Placeholder: "e.g., Warrior, Mage, Rogue, Healer..."
- **Character Backstory** (textarea, optional) — maps to `character_backstory`. Placeholder: "Tell us about your character's past..."

Behavior:
1. On submit: POST to `/api/campaign/[id]/join`
2. On success: store `session_token` in localStorage via `setSessionToken`, update parent state to show "joined" view
3. On error: display error message (username taken, campaign full, etc.)
4. Disable form while request is in flight

Props:
```typescript
{
  campaignId: string
  onJoined: (player: Player) => void
}
```

**Step 1: Implement component**

Client component with form state, fetch call, error handling.

**Step 2: Visual test**

- Form renders with all 4 fields
- Submit with empty username → error
- Submit with valid data → loading → calls onJoined with player data

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: character creation form component"
```

---

### Task 4: Build Lobby Page

**Files:**
- Modify: `app/campaign/[id]/lobby/page.tsx`

**Spec:**

The lobby page has two states:

**State 1: Not joined (no session token for this campaign)**
- Show campaign info: name, cover image (if available), world description excerpt
- Show the CharacterCreation form
- Show current player count: "X/6 players joined"

**State 2: Joined (session token found in localStorage)**
- Show campaign info: name, cover image, world description excerpt
- Show player list (all players in this campaign)
- Show "Share this link" with the campaign URL prominently displayed + copy button
- If current user is host: show "Start Session" button (disabled until at least 1 player joined)
- If current user is not host: show "Waiting for host to start..."

**Data loading:**
- On mount: GET `/api/campaign/[id]` to fetch campaign + players
- Check localStorage for session token matching this campaign
- If token found, find matching player in the player list
- If campaign status is not `lobby`, redirect to `/campaign/[id]` (game room)

**Step 1: Add shadcn components**

Run: `npx shadcn@latest add separator badge avatar`

**Step 2: Implement lobby page**

Server component that fetches campaign data, then renders a client component for interactivity.

Actually — since we need localStorage access, the page itself can be a client component that fetches on mount. Or use a server component for the initial data load and a client component for the interactive parts.

Approach: The page is a client component. On mount, it fetches campaign data from the API. It checks localStorage for a session token. Based on that, it renders either the join form or the lobby view.

**Step 3: Add "copy link" functionality**

Display the campaign URL (window.location.origin + `/campaign/[id]`). Add a copy button that uses `navigator.clipboard.writeText()`.

**Step 4: Visual test**

- Visit `/campaign/[id]/lobby` without session token → shows join form + campaign info
- Join → form disappears, shows lobby with player list
- Player list shows the just-joined player
- Share link displays and copy button works
- Host sees "Start Session" button
- Non-host sees "Waiting for host..."

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: lobby page with join form and player list"
```

---

### Task 5: Campaign Redirect Logic

**Files:**
- Modify: `app/campaign/[id]/page.tsx`

**Spec:**

The game room page (`/campaign/[id]`) should redirect based on campaign status:
- `lobby` → redirect to `/campaign/[id]/lobby`
- `active` → stay (render game room — placeholder for now)
- `paused` → show "Campaign is paused" message with "Resume" option (if host)
- `ended` → redirect to `/campaign/[id]/summary`

**Step 1: Implement redirect logic**

Fetch campaign data on mount. Use `useRouter().replace()` for redirects.

**Step 2: Visual test**

- Visit `/campaign/[id]` where status is `lobby` → redirected to lobby
- (Other statuses tested in later PRs)

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: campaign page redirect based on status"
```

---

## Testing Strategy

| What | How | Detail |
|------|-----|--------|
| POST /api/campaign/[id]/join | Unit test (vitest) | 7 tests: all error paths + success |
| lib/session.ts | Unit test (vitest) | 6 tests: set, get, getAll, clear, multi-campaign |
| CharacterCreation component | Visual/manual | Form validation, submit, error display |
| Lobby page states | Visual/manual | Not joined → joined transition, host vs non-host |
| Redirect logic | Visual/manual | /campaign/[id] → /campaign/[id]/lobby for lobby status |

---

## Acceptance Criteria

- [ ] `POST /api/campaign/[id]/join` validates and creates player (7 tests passing)
- [ ] `lib/session.ts` manages session tokens in localStorage (6 tests passing)
- [ ] Character creation form submits and stores session token
- [ ] Lobby shows campaign info, player list, and share link
- [ ] Host sees "Start Session" button, non-host sees waiting message
- [ ] `/campaign/[id]` redirects to lobby when status is `lobby`
- [ ] `yarn build` succeeds
