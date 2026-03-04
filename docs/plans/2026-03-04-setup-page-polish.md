# Setup Page Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Polish the campaign setup page so it correctly guards access, handles all broadcast events from the edge function, and delivers a clear UX through generation → success/error states.

**Architecture:** The page already exists at `app/campaign/[id]/setup/page.tsx` with auth guard, Realtime subscriptions, and retry logic. This plan adds the missing `world:started` handler, fixes the retry-button visibility bug, adds a redirect for campaigns that have moved past the setup states, and verifies the complete happy-path UX.

**Tech Stack:** Next.js 14 App Router, Supabase Realtime broadcast, React hooks, Vitest (RTL not used for this page — visual/manual testing)

---

## Context: What Already Works

Before touching code, understand what is already implemented:

- `app/campaign/[id]/setup/page.tsx` — full page with auth guard, Realtime subscriptions, retry, WorldPreview
- `app/api/campaign/[id]/regenerate/route.ts` — POST endpoint that resets status → `generating` and calls edge function
- `supabase/functions/generate-world/index.ts` — broadcasts `world:started`, `world:progress`, `world:complete`, `world:error`
- `components/campaign/WorldPreview.tsx` — shows WORLD.md content + "Enter Lobby" button

## Events the Edge Function Broadcasts

| Event | Payload | Meaning |
|---|---|---|
| `world:started` | `{ status: 'generating' }` | Generation kicked off |
| `world:progress` | `{ attempt, maxAttempts }` | Retry in progress |
| `world:complete` | `{ status: 'lobby' }` | Success — DB already updated |
| `world:error` | `{ status: 'error' }` | Failed — DB already updated |

---

## Task 1: Add `world:started` broadcast handler

**Files:**
- Modify: `app/campaign/[id]/setup/page.tsx:69-97`

The page currently ignores `world:started`. Add a handler that resets error state and shows the spinner if the page is open when a retry/new generation begins.

**Step 1: Open the file and find the channel subscription block**

Read `app/campaign/[id]/setup/page.tsx`. The `.on('broadcast', { event: 'world:progress' }, ...)` block starts around line 71.

**Step 2: Add the `world:started` handler**

Insert `.on('broadcast', { event: 'world:started' }, ...)` before the `world:progress` handler:

```tsx
.on('broadcast', { event: 'world:started' }, () => {
  if (!mounted) return
  setError(null)
  setBusy(true)
  setStatusText('World forge is active. This page updates automatically...')
})
```

**Step 3: Manual verification**

- Navigate to `/campaign/<id>/setup` while generation is running
- Confirm the page shows the spinner and correct status text from the start
- No visual regressions

**Step 4: Commit**

```bash
git add app/campaign/\[id\]/setup/page.tsx
git commit -m "feat: handle world:started broadcast event on setup page"
```

---

## Task 2: Fix retry button visibility — only show in error state

**Files:**
- Modify: `app/campaign/[id]/setup/page.tsx:205-236`

**Problem:** The retry button shows whenever `campaign?.status !== 'lobby'`, which includes the `generating` state. Users should not be able to trigger a retry while generation is already running.

**Step 1: Locate the conditional rendering**

In the return JSX, find the block starting at ~line 205:
```tsx
{campaign?.status === 'lobby' && campaign ? (
  <WorldPreview ... />
) : (
  <div className="flex flex-col items-center gap-6 py-6">
    ...buttons...
  </div>
)}
```

**Step 2: Gate the retry button behind the error state**

Change the buttons section to only show "Retry Generation" when `campaign?.status === 'error'` or `error` state is truthy:

```tsx
{campaign?.status === 'lobby' && campaign ? (
  <WorldPreview campaign={campaign} worldContent={worldContent} />
) : (
  <div className="flex flex-col items-center gap-6 py-6">
    {busy && <div className="piston-loader" aria-label="Generating..." />}

    {error && (
      <p className="text-sm" style={{ color: '#a63d2a' }}>
        {error}
      </p>
    )}

    <div className="flex w-full max-w-sm gap-3">
      {(campaign?.status === 'error' || error) && (
        <Button
          type="button"
          onClick={handleRetryGeneration}
          disabled={isRetrying}
          className="flex-1"
        >
          {isRetrying ? 'Retrying...' : 'Retry Generation'}
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={() => router.push('/')}
        className="flex-1"
      >
        Back Home
      </Button>
    </div>
  </div>
)}
```

**Step 3: Manual verification — generating state**

- Create a campaign or trigger `/api/campaign/<id>/regenerate`
- Confirm during `generating`: spinner visible, NO retry button, "Back Home" visible
- Confirm after `world:error`: spinner gone, error message shown, retry button appears

**Step 4: Manual verification — error state on page load**

- In Supabase dashboard, set a campaign status to `error`
- Navigate to `/campaign/<id>/setup`
- Confirm: error message shown, retry button visible, no spinner

**Step 5: Commit**

```bash
git add app/campaign/\[id\]/setup/page.tsx
git commit -m "fix: show retry button only in error state on setup page"
```

---

## Task 3: Redirect campaigns not in setup-eligible states

**Files:**
- Modify: `app/campaign/[id]/setup/page.tsx:99-127`

**Problem:** If a campaign is `active`, `paused`, or `ended`, the setup page should redirect — it's only meaningful for `generating`, `error`, and `lobby` states.

**Step 1: Locate the auth + initial load block**

Find the IIFE starting at ~line 99 that calls `loadCampaign()` and checks `host_user_id`.

**Step 2: Add status guard after the host check**

After the host check redirect, add:

```tsx
const SETUP_ELIGIBLE_STATUSES: Campaign['status'][] = ['generating', 'error', 'lobby']
if (!SETUP_ELIGIBLE_STATUSES.includes(data.campaign.status)) {
  router.replace('/')
  return
}
```

Place the constant outside the component (top of file, after imports):

```tsx
const SETUP_ELIGIBLE_STATUSES: Array<Campaign['status']> = ['generating', 'error', 'lobby']
```

**Step 3: Manual verification**

- Set a campaign to `active` in Supabase dashboard
- Navigate to `/campaign/<id>/setup`
- Confirm: instant redirect to `/`
- Set campaign back to `generating` — confirm setup page loads normally

**Step 4: Commit**

```bash
git add app/campaign/\[id\]/setup/page.tsx
git commit -m "feat: redirect non-setup-eligible campaign statuses from setup page"
```

---

## Task 4: Clean up redundant `mountedRef`

**Files:**
- Modify: `app/campaign/[id]/setup/page.tsx`

**Problem:** The page uses both a `mounted` local variable inside the Realtime `useEffect` AND a `mountedRef` (used only in `handleRetryGeneration`). The ref adds complexity.

**Step 1: Replace `mountedRef` usages with a pattern that avoids the ref**

In `handleRetryGeneration`, the ref guards against setting state after unmount. A simpler pattern: check inside the callback only when needed, or accept that React 18 silently drops setState calls on unmounted components (no longer throws). Remove the `mountedRef` entirely.

Remove:
```tsx
const mountedRef = useRef(true)
```

Remove the second `useEffect` that manages `mountedRef`:
```tsx
useEffect(() => {
  mountedRef.current = true
  return () => {
    mountedRef.current = false
  }
}, [])
```

Replace all `if (mountedRef.current)` guards in `handleRetryGeneration` with plain code (React 18 handles this gracefully):

```tsx
async function handleRetryGeneration() {
  setError(null)
  setIsRetrying(true)

  try {
    const res = await fetch(`/api/campaign/${campaignId}/regenerate`, {
      method: 'POST',
    })
    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error ?? 'Failed to retry world generation.')
    }

    setBusy(true)
    setStatusText('Retry triggered. World forge is active in the background...')
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to retry world generation.')
    setBusy(false)
  } finally {
    setIsRetrying(false)
  }
}
```

**Step 2: Remove `useRef` from the import if no longer used**

Check imports at line 3 — remove `useRef` if it's now unused.

**Step 3: Manual verification**

- Full happy path: create campaign → watch generation → see WorldPreview
- Error path: simulate error → retry → watch regeneration

**Step 4: Commit**

```bash
git add app/campaign/\[id\]/setup/page.tsx
git commit -m "refactor: remove redundant mountedRef in setup page"
```

---

## Task 5: Apply design system — fix violations in setup page and WorldPreview

**Files:**
- Modify: `app/campaign/[id]/setup/page.tsx`
- Modify: `components/campaign/WorldPreview.tsx`

The project uses a steampunk design system defined in `docs/plans/2026-03-03-steampunk-design-system.md` (the spec) and implemented in `app/globals.css` (the CSS). Both files contain violations: inline `style={}` props with raw colors/fonts that should be Tailwind utility classes or semantic CSS custom properties, and missing use of established component classes (`.iron-plate`, `.display-title`, `.brass-pipe`). Read both documents before making changes.

**Design system reference (key mappings):**

| CSS var | Tailwind class | Usage |
|---|---|---|
| `var(--ash)` | `text-ash` / `text-muted-foreground` | Secondary text |
| `var(--steam)` | `text-steam` / `text-foreground` | Primary text |
| `var(--rust)` | `text-destructive` | Error text |
| `var(--font-heading)` | `font-heading` | Section headings |
| `var(--font-display)` | `font-display` | Hero titles |

| CSS class | What it does |
|---|---|
| `.iron-plate` | Primary card container — chamfered, smog bg, border |
| `.display-title` | Gradient brass title with text-shadow + uppercase |
| `.brass-pipe` | Horizontal brass divider with end caps |
| `.brass-nameplate` | Label strip in brass/copper gradient |

**Step 1: Fix setup page — remove redundant inline background on iron-plate**

In `app/campaign/[id]/setup/page.tsx`, the `.iron-plate` div at ~line 187 has a redundant `style={{ background: 'rgba(42, 37, 32, 0.85)' }}`. The `.iron-plate` class already sets `background: var(--smog)`. Remove the inline style entirely:

```tsx
// Before
<div
  className="iron-plate p-8 md:p-10"
  style={{ background: 'rgba(42, 37, 32, 0.85)' }}
>

// After
<div className="iron-plate p-8 md:p-10">
```

**Step 2: Fix setup page — replace inline font style with Tailwind class**

At ~line 195, the heading uses `style={{ fontFamily: 'var(--font-heading), serif' }}`. Use the `font-heading` Tailwind class instead (already mapped in `globals.css` `@theme inline`):

```tsx
// Before
<h1
  className="text-2xl tracking-[0.08em] text-steam"
  style={{ fontFamily: 'var(--font-heading), serif' }}
>

// After
<h1 className="font-heading text-2xl text-steam">
```

Note: `font-heading` already applies uppercase and letter-spacing via `@layer base h1`, so remove `tracking-[0.08em]` (handled globally).

**Step 3: Fix setup page — replace inline ash color with Tailwind class**

At ~line 199, the status paragraph uses `style={{ color: 'var(--ash)' }}`:

```tsx
// Before
<p className="mt-2 text-sm" style={{ color: 'var(--ash)' }}>
  {statusText}
</p>

// After
<p className="mt-2 text-sm text-muted-foreground">
  {statusText}
</p>
```

**Step 4: Fix setup page — replace raw hex error color with semantic class**

The error paragraph uses `style={{ color: '#a63d2a' }}` (hardcoded `--rust`). Use `text-destructive` instead:

```tsx
// Before
<p className="text-sm" style={{ color: '#a63d2a' }}>
  {error}
</p>

// After
<p className="text-sm text-destructive">
  {error}
</p>
```

**Step 5: Fix WorldPreview — replace custom container with iron-plate**

In `components/campaign/WorldPreview.tsx`, the wrapper div uses arbitrary bracket notation (`border-[--gunmetal]`, `bg-[--smog]/85`) instead of the `.iron-plate` class:

```tsx
// Before
<div className="rounded border border-[--gunmetal] bg-[--smog]/85 p-8 max-w-2xl mx-auto">

// After
<div className="iron-plate p-8 max-w-2xl mx-auto">
  <div className="rivet-bottom-left" />
  <div className="rivet-bottom-right" />
```

The `.iron-plate` class provides the border, background, chamfered corners, and top rivets via `::before`/`::after`. The `rivet-bottom-left` and `rivet-bottom-right` divs add the four-corner rivet pattern (same as setup page outer container).

**Step 6: Fix WorldPreview — replace custom title with display-title class**

The campaign name heading currently uses `font-display text-4xl uppercase text-[--brass]` with an inline `textShadow`. The `.display-title` class already encapsulates all of this (gradient, text-shadow, uppercase, display font):

```tsx
// Before
<h1 className="font-display text-4xl uppercase text-[--brass] mb-6"
    style={{ textShadow: '0 0 20px rgba(196,148,61,0.4)' }}>
  {campaign.name}
</h1>

// After
<h1 className="display-title text-4xl mb-6">
  {campaign.name}
</h1>
```

**Step 7: Fix WorldPreview — replace bracket notation text color with Tailwind class**

```tsx
// Before
<pre className="font-body text-[--steam] text-sm leading-relaxed whitespace-pre-wrap">

// After
<pre className="text-steam text-sm leading-relaxed whitespace-pre-wrap">
```

`font-body` is redundant — `body` already sets `font-family: var(--font-body)` in `@layer base`.

**Step 8: Add brass-pipe divider after WorldPreview title (consistent with setup page header)**

After the `<h1>` in WorldPreview, add a `brass-pipe` divider to match the visual rhythm of the setup page:

```tsx
<h1 className="display-title text-4xl mb-4">
  {campaign.name}
</h1>
<div className="brass-pipe mx-auto mb-6 w-24" />
<ScrollArea ...>
```

**Step 9: Manual verification**

- Navigate to setup page during `generating` state — confirm status text is `text-muted-foreground` (muted), heading uses heading font, no inline styles visible in devtools
- Trigger error — confirm error text is the destructive red
- Navigate to setup page with `lobby` status — confirm WorldPreview has chamfered iron-plate border, brass gradient title, brass-pipe divider

**Step 10: Commit**

```bash
git add app/campaign/\[id\]/setup/page.tsx components/campaign/WorldPreview.tsx
git commit -m "style: apply design system tokens to setup page and WorldPreview"
```

---

## Task 6: End-to-end manual test checklist

No automated tests needed for this client-side page (project convention). Run through this checklist manually.

**Generating state (happy path):**
- [ ] Host navigates to `/campaign/<id>/setup` while generation is in progress
- [ ] Spinner shows, "Back Home" shows, NO retry button
- [ ] Status text: "World forge is active..."
- [ ] If retrying (attempt 2+): status text shows "Generating world... (attempt 2/3)"
- [ ] On `world:complete`: spinner hides, WorldPreview renders with WORLD.md content
- [ ] "Enter Lobby" button navigates to `/campaign/<id>/lobby`

**Error state:**
- [ ] On `world:error`: spinner hides, error message shows, retry button appears
- [ ] Clicking "Retry Generation" triggers POST to `/api/campaign/<id>/regenerate`
- [ ] After retry POST: spinner reappears, retry button hidden, status text updates
- [ ] After successful retry: WorldPreview shown

**Page load with existing status (DB-driven, no broadcast):**
- [ ] Load page with campaign in `generating` state: spinner, no retry
- [ ] Load page with campaign in `error` state: error message, retry button
- [ ] Load page with campaign in `lobby` state: WorldPreview shown immediately
- [ ] Load page with campaign in `active` state: redirect to `/`

**Access guard:**
- [ ] Non-host user: redirect to `/`
- [ ] Unauthenticated: redirect to `/login?redirect=...`
