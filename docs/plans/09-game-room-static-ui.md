# PR 09: Game Room Layout + Static UI

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the full game room layout with all UI components rendering static/fetched data. No AI narration or real-time messaging yet — this PR focuses on the visual layout and data display from the database.

**Architecture:** The game room is a 3-column layout: left sidebar (player list), center (message feed), bottom bar (action input). Scene image displayed at the top or right. All data fetched from the database on mount. Components are built as presentational/display components first, then wired to interactive behavior in later PRs.

**Tech Stack:** Next.js, shadcn/ui, Tailwind CSS

**Depends on:** PR 08

---

### Task 1: Build the Game Room Layout

**Files:**
- Modify: `app/campaign/[id]/page.tsx`
- Create: `components/game/GameRoom.tsx`

**Spec:**

Layout structure:
```
┌────────────────────────────────────────────────────┐
│  Scene Image (collapsible, full width)             │
├──────────┬─────────────────────────────────────────┤
│          │                                         │
│  Player  │          Message Feed                   │
│  List    │          (scrollable)                   │
│  Sidebar │                                         │
│          │                                         │
│  (200px) │                                         │
│          ├─────────────────────────────────────────┤
│          │  Action Input Bar                       │
├──────────┴─────────────────────────────────────────┤
```

- Full viewport height (h-screen)
- Sidebar: fixed width (~200-240px), scrollable if many players
- Center: flex-grow, with message feed taking remaining space and action input pinned at bottom
- Scene image: collapsible panel at the top of the center area

The `GameRoom` component receives campaign, players, messages, and current player as props.

**Step 1: Create GameRoom layout component**

**Step 2: Wire into the page**

`app/campaign/[id]/page.tsx`:
- Fetch campaign, players, messages from API on mount
- Identify current player from session token in localStorage
- If campaign status is `lobby`, redirect to lobby
- Pass data to `GameRoom` component

**Step 3: Visual test**

- Visit `/campaign/[id]` for an active campaign → 3-column layout renders
- Layout is full viewport height, no scrollbar on body
- Sidebar visible on left, center area fills remaining space

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: game room layout with 3-column structure"
```

---

### Task 2: Build PlayerList Sidebar

**Files:**
- Create: `components/game/PlayerList.tsx`
- Create: `components/shared/HPBar.tsx`

**Spec:**

`PlayerList` renders all players in the campaign:
- Character portrait (avatar, with fallback to initials)
- Character name (or username if no character name)
- Character class (small text below name)
- HP bar showing current/max HP
- Status indicator: colored dot or badge
  - `active` → green
  - `incapacitated` → yellow
  - `dead` → red
  - `absent` → gray
- Current player highlighted with a subtle border/glow

`HPBar` component:
- Props: `hp: number`, `hpMax: number`
- Visual: horizontal bar, green > 50%, yellow 25-50%, red < 25%
- Shows text: "15/20 HP"

**Step 1: Implement HPBar**

Small, self-contained component. Use Tailwind width percentage for the bar fill.

**Step 2: Implement PlayerList**

List of player cards in the sidebar. Each card shows avatar, name, class, HP bar, status dot.

**Step 3: Visual test**

- Players render with portraits (or initials)
- HP bar shows correct fill and color
- Status dots show correct colors
- Current player has visual distinction

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: PlayerList sidebar with HP bars and status"
```

---

### Task 3: Build MessageFeed

**Files:**
- Create: `components/game/MessageFeed.tsx`

**Spec:**

`MessageFeed` renders the game log — a scrollable list of messages in chronological order.

Message types and their rendering:

| Type | Rendering |
|------|-----------|
| `narration` | Serif font, parchment color, full-width. Player_id is null (AI/GM). Prefix with a GM icon or "Game Master" label. |
| `action` | Player avatar + name in gold, then action text. e.g., "**Gandalf**: I cast fireball at the goblins" |
| `system` | Muted, centered, smaller text. e.g., "Gandalf has joined the game" |
| `ooc` | Italicized, muted. Prefixed with "[OOC]". Out-of-character chat. |

If a message has an `image_url`, display the image inline (below the message text). Use `next/image` or `<img>` with proper sizing.

Auto-scroll: the feed should scroll to the bottom when new messages are added (but not when the user has scrolled up to read history).

Props:
```typescript
{
  messages: Message[]
  players: Player[]  // to resolve player_id → name/avatar
}
```

**Step 1: Add shadcn scroll-area if not already added**

**Step 2: Implement MessageFeed**

Render messages in a scrollable container. Different styling per type. Use `useRef` + `useEffect` for auto-scroll behavior.

**Step 3: Seed test data**

For visual testing, create a few mock messages of each type to verify rendering. This can be hardcoded temporarily in the game room page.

**Step 4: Visual test**

- Narration messages render in serif font, parchment color
- Action messages show player name in gold + action text
- System messages are centered, muted
- Images display inline when present
- Feed auto-scrolls to bottom on load
- Scrolling up stays in position (no forced jump)

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: MessageFeed component with message type styling"
```

---

### Task 4: Build ActionInput

**Files:**
- Create: `components/game/ActionInput.tsx`

**Spec:**

The action input bar at the bottom of the game room:

- Text input (textarea, single line expanding to max 3 lines)
- Submit button (gold, with send icon)
- The input is enabled when it's the player's turn (or in free mode, always enabled for active players)
- Disabled state: grayed out with "Waiting for your turn..." placeholder
- Dead/incapacitated state: grayed out with "You are [dead/incapacitated]..." placeholder

For now (static UI), the input is always enabled. Turn logic comes in PR 11.

Props:
```typescript
{
  onSubmit: (content: string) => void
  disabled?: boolean
  placeholder?: string
}
```

Behavior:
- Enter key submits (Shift+Enter for newline)
- Clear input after submit
- Prevent empty submissions

**Step 1: Implement ActionInput**

Client component with `useState` for text, `onKeyDown` handler for Enter/Shift+Enter.

**Step 2: Visual test**

- Input renders at bottom of game room
- Gold submit button
- Enter submits, Shift+Enter adds newline
- Input clears after submit
- Dark fantasy styling consistent with theme

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: ActionInput component with submit behavior"
```

---

### Task 5: Build SceneImage Display

**Files:**
- Create: `components/game/SceneImage.tsx`

**Spec:**

Displays the most recent scene image at the top of the center area:

- Shows the latest message with an `image_url` of type `narration`
- Collapsible: click to expand/collapse
- When collapsed: show a thin preview strip (64px height) with the image
- When expanded: show full image (max 400px height)
- Default: expanded
- If no scene image exists: hidden entirely

Props:
```typescript
{
  imageUrl: string | null
}
```

**Step 1: Implement SceneImage**

Use `useState` for expanded/collapsed toggle. CSS transition for smooth collapse.

**Step 2: Visual test**

- With image URL: shows image, click toggles expand/collapse
- Without image: component not visible
- Smooth transition between states

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: SceneImage collapsible display component"
```

---

### Task 6: Fetch Messages API Route

**Files:**
- Modify: `app/api/campaign/[id]/route.ts`

**Spec:**

Update `GET /api/campaign/[id]` to include messages:

Add query parameter: `?include=messages`

When `include=messages` is present, also return:
```json
{
  "campaign": { ... },
  "players": [ ... ],
  "files": [ ... ],
  "messages": [ ... ]  // ordered by created_at ASC
}
```

Messages are limited to the current session (where `session_id` matches `campaign.current_session_id`). If no current session, return empty array.

**Step 1: Update tests**

```typescript
it('includes messages when include=messages param is present', ...)
it('returns only current session messages', ...)
it('returns empty messages array when no current session', ...)
```

3 new test cases.

**Step 2: Run tests — fail**

**Step 3: Update implementation**

**Step 4: Run tests — pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: include messages in GET /api/campaign/[id]"
```

---

## Testing Strategy

| What | How | Detail |
|------|-----|--------|
| GET /api/campaign/[id] (messages) | Unit test (vitest) | 3 new tests for message inclusion |
| Game room layout | Visual/manual | 3-column structure, full viewport, responsive sidebar |
| PlayerList + HPBar | Visual/manual | Portraits, HP bars, status colors, current player highlight |
| MessageFeed | Visual/manual | All 4 message types render correctly, auto-scroll works |
| ActionInput | Visual/manual | Submit behavior, Enter/Shift+Enter, disabled states |
| SceneImage | Visual/manual | Expand/collapse toggle, image rendering, hidden when empty |

---

## Acceptance Criteria

- [ ] Game room renders 3-column layout (sidebar, feed, input)
- [ ] PlayerList shows portraits, names, HP bars, status indicators
- [ ] HPBar renders correct fill and color based on HP percentage
- [ ] MessageFeed renders all 4 message types with correct styling
- [ ] MessageFeed auto-scrolls to bottom, preserves scroll position when reading history
- [ ] ActionInput submits on Enter, clears after submit, supports Shift+Enter
- [ ] SceneImage expands/collapses smoothly, hidden when no image
- [ ] GET /api/campaign/[id] includes messages (3 tests passing)
- [ ] `npm run build` succeeds
