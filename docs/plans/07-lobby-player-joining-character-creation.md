# Plan 07 — Lobby: Player Joining & Character Creation

**Branch:** `feat/lobby-page`
**Route:** `/campaign/[id]/lobby`
**Scope:** Static UI only — no backend calls, no Realtime (those come in PR 08)

---

## Overview

The Lobby is the pre-game staging area. After world generation completes, the host shares the campaign link. Players navigate to `/campaign/[id]/lobby`, create their characters, and mark themselves ready. The host can also mark players as ready and, once everyone is set, start the game.

This PR covers **only the UI** — all data is mocked/local state. API wiring and Realtime happen in PR 08.

---

## Design: "Crew Manifest"

**Concept:** A brass-lit operations board where adventurers register before the mission departs. The campaign's cover art bleeds into the background; player slots appear as dossier cards pinned to a manifest board.

**Layout (desktop — two columns):**
- **Left 60%**: Campaign header + scrollable player roster
- **Right 40%**: Sticky character form panel

**Layout (mobile):** Stacked — form first, roster below.

---

## Atmosphere & Visual Details

- Full-bleed background: campaign cover image with heavy dark vignette overlay
- Furnace underglow from bottom (existing `.furnace-overlay` class)
- Ember particles (sparse, count ~15)
- Ambient smoke layer
- Large gear decoration faded into corner

---

## Sections

### 1. Campaign Header (top of left column)

Displays:
- Campaign cover image (small, 120×80px, chamfered iron-plate frame)
- Campaign name (`display-title` styling, truncated)
- World tagline/description (1–2 lines, `--ash` color, `Barlow Condensed`)
- Hosted by: `<host_username>` (brass label)
- Status chip: `ASSEMBLING CREW` (amber, pulsing dot)

---

### 2. Player Roster — "Crew Manifest"

Section heading: **CREW MANIFEST** (`Rokkitt`, uppercase, I-beam dividers)

Slot count: always renders 6 slots (max players). Each slot is a card.

#### Card States

| State | Visual |
|-------|--------|
| **Empty** | Dashed `--gunmetal` border, "Waiting for player..." ghost text, slot number in corner |
| **Not Ready** | Solid `--gunmetal` border, character name + class shown, amber `NOT READY` badge |
| **Ready** | Solid `--brass` border, brass glow, green `READY` badge with checkmark |

#### Card Contents (filled slots)
- Avatar placeholder (circular, 56px, `--smog` bg with class icon or initials)
- **Character Name** (`Rokkitt`, 1rem)
- **Class** (`Share Tech Mono`, `--ash`, small caps)
- **Username** (below class, `--ash`, small)
- **Status badge**: `READY` (green + check) or `NOT READY` (amber)
- **[Host only]** "Mark as Ready" button on `NOT READY` cards (small, outline style)

#### Own Card (current user)
- Highlighted with a subtle `--brass` left border accent
- Shows "You" chip next to username
- "Edit Character" button always visible if character is saved
- "I'm Ready" button (primary brass) if character is saved but not yet ready
- If already ready: shows "Ready ✓" state (no button, locked)

---

### 3. Host Controls Bar

Rendered only for the host, below the roster.

- **"Start Game"** button (large, primary brass, full width)
  - **Disabled** with tooltip: "Waiting for all players to be ready" if any slot with a player is `NOT READY`
  - **Enabled** once all joined players are `READY`
- Small status line: `X / Y players ready`

---

### 4. Character Form Panel (right column)

Section heading: **YOUR CHARACTER**

Shown to all players (including host, who also plays).

#### Form Fields

| Field | Input | Notes |
|-------|-------|-------|
| Character Name | Text input | Required, max 40 chars |
| Class | Button grid (6 options) | Warrior · Rogue · Mage · Cleric · Ranger · Bard |
| Backstory | Textarea | Optional, max 500 chars, placeholder: "Who were you before this?" |

#### Class Button Grid
- 2×3 grid of toggle buttons
- Each has a small icon (SVG or emoji) + label
- Selected state: `--brass` border + amber background tint
- Unselected: `--gunmetal` border, `--ash` text

#### Form Actions
- **"Save Character"** — primary button, saves to local state + updates own player card
  - Loading state: "Saving..."
  - Disabled if character name empty or no class selected
- **"I'm Ready"** — secondary button, only shown after character is saved
  - Clicking locks the form and sets own status to `READY`
  - Disabled until character is saved

#### Ready State
Once "I'm Ready" is clicked:
- Form fields become read-only (visually dimmed)
- "I'm Ready" button replaced with `Ready ✓` chip (green, non-interactive)
- "Edit Character" link appears below chip (clicking unlocks form and sets back to `NOT READY`)

---

## Component Breakdown

| File | Description |
|------|-------------|
| `app/campaign/[id]/lobby/page.tsx` | Main page with layout, mock state, host/player detection |
| `components/lobby/PlayerCard.tsx` | Single player card (all states) |
| `components/lobby/CharacterForm.tsx` | Character creation/edit form with class picker |
| `components/lobby/ClassButton.tsx` | Single class toggle button |
| `components/lobby/HostControls.tsx` | "Start Game" bar (host only) |

---

## Mock State (for this PR)

Use `useState` with hardcoded mock data to demonstrate all states:

```ts
// Mock players for development
const MOCK_PLAYERS = [
  { id: '1', username: 'marco', character_name: 'Aldric Voss', character_class: 'Warrior', is_host: true, status: 'ready', isCurrentUser: true },
  { id: '2', username: 'sara',  character_name: 'Nyx',         character_class: 'Rogue',   is_host: false, status: 'not_ready' },
  { id: '3', username: 'paulo', character_name: null,          character_class: null,       is_host: false, status: 'empty' },
  // slots 4–6: empty
]
```

Toggle between mock states using dev-only buttons (or just hardcode representative variety).

---

## Responsive Behavior

| Breakpoint | Layout |
|------------|--------|
| `≥1024px` | Two-column: roster left, form right (sticky) |
| `768–1023px` | Two-column, narrower — form collapses to accordion |
| `<768px` | Single column: form first, roster second |

---

## Animations

| Element | Animation |
|---------|-----------|
| Page entrance | `fadeInUp` staggered on header, roster, form panel |
| Player card appearance | `fadeInUp` with 50ms stagger per card |
| Card state change (→ Ready) | Border color transition + badge swap (0.3s ease) |
| "I'm Ready" button click | Brief brass pulse glow on own card |
| "Start Game" button enable | Fade from disabled to active (0.4s) |

All animations respect `prefers-reduced-motion`.

---

## Out of Scope (PR 08)

- Supabase data fetching (campaign, players)
- Real-time player join/leave events
- Character save API call (`POST /api/campaign/[id]/join`)
- Host "Start Game" API call
- Character portrait generation (Gemini)
- Auth guard (redirect to login if unauthenticated)

---

## Acceptance Criteria

- [ ] Route `/campaign/[id]/lobby` renders without errors
- [ ] All 6 player slots render correctly (empty, not-ready, ready states)
- [ ] Own card is visually distinguished
- [ ] Character form saves to local state and updates own card
- [ ] "I'm Ready" locks form and sets card to Ready state
- [ ] "Edit Character" unlocks form
- [ ] Host sees "Mark as Ready" on NOT READY cards
- [ ] "Start Game" is disabled until all joined players are Ready
- [ ] Layout is responsive on mobile
- [ ] All steampunk design tokens applied (fonts, colors, components)
- [ ] Ember particles and atmospheric effects present
