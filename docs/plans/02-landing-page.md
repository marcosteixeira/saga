# PR 02: Landing Page + Dark Fantasy Theme

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish the dark fantasy design system (colors, fonts, theme tokens) and build the landing page — hero section, "Create Campaign" CTA, "Join Campaign" input. Add placeholder pages for all routes so navigation works end-to-end.

**Architecture:** Fully static page with one client interaction (join input parses a campaign URL/ID and navigates). No API calls, no database. Placeholder pages establish the route structure for future PRs.

**Tech Stack:** Next.js 14, shadcn/ui (Button, Input), `next/navigation`, Google Fonts

**Depends on:** PR 01

---

### Task 1: Define Dark Fantasy Theme

**Files:**
- Modify: `app/globals.css` — CSS custom properties for dark fantasy palette
- Modify: `tailwind.config.ts` — extend with fantasy-specific tokens
- Modify: `app/layout.tsx` — add fonts (serif + sans-serif)

**Theme Spec:**

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#0a0a0a` | Page background |
| `--foreground` | `#e8e0d4` | Default text (parchment) |
| `--card` | `#1a1a2e` | Card/panel backgrounds |
| `--card-foreground` | `#e8e0d4` | Card text |
| `--primary` | `#d4a574` | Gold/amber CTA buttons, accents |
| `--primary-foreground` | `#0a0a0a` | Text on primary |
| `--secondary` | `#2a2a4a` | Secondary surfaces |
| `--muted` | `#1a1a2e` | Muted backgrounds |
| `--muted-foreground` | `#8a8a8a` | Muted text |
| `--border` | `#2a2a4a` | Borders |
| `--accent` | `#c9a55a` | Secondary accent (gold) |

**Fonts:**
- Serif: Google Fonts — use a medieval-inspired serif (e.g., "Cinzel" for headings, "Crimson Text" for narration body)
- Sans-serif: "Inter" for UI elements

**Step 1: Update CSS variables in `globals.css`**

Replace the default shadcn `:root` / `.dark` variables with the dark fantasy palette above. Since the app is always dark, only define one set under `:root`.

**Step 2: Extend Tailwind config**

Add `fontFamily` entries: `font-serif` → Cinzel/Crimson Text, `font-sans` → Inter.

**Step 3: Configure fonts in root layout**

Use `next/font/google` to load Cinzel, Crimson Text, and Inter. Apply `font-sans` as the default body font. Add `dark` class to `<html>`.

**Step 4: Visual test**

Render a test page with:
- `<h1 className="font-serif text-primary">` — should show gold serif heading
- `<p className="text-foreground">` — should show parchment-colored text
- Background should be `#0a0a0a`

Screenshot or visually confirm all tokens render correctly.

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: dark fantasy theme with fonts and color palette"
```

---

### Task 2: Build Landing Page

**Files:**
- Modify: `app/page.tsx` — landing page content

**Landing Page Spec:**

The page has three sections stacked vertically, centered:

1. **Hero Section**
   - Full viewport height
   - Large serif heading: "Saga" (or similar title)
   - Subtitle in parchment text: "AI-powered tabletop RPG — no dice, no prep, just adventure"
   - Subtle gradient or texture overlay on dark background
   - Optional: decorative border or medieval ornament divider

2. **CTA Section**
   - Primary gold button: "Create Campaign" → links to `/campaign/new`
   - Secondary text/link: "Have a campaign link? Join here" → text input + "Join" button
   - The join input accepts a campaign URL or ID. On submit, navigates to `/campaign/[id]`

3. **Footer**
   - Minimal: "Built with AI" or similar tagline
   - Dark, unobtrusive

**Step 1: Add shadcn components**

Run: `npx shadcn@latest add button input`

**Step 2: Build hero section**

Full-height flex container with centered content. Serif font for title, sans for subtitle. Gold gradient on the title text.

**Step 3: Build CTA section**

"Create Campaign" as a `<Link>` styled as primary `<Button>`. Join section: an `<Input>` (shadcn) + secondary `<Button>`. Client-side navigation using `useRouter`.

**Step 4: Wire up join navigation**

When user pastes a URL like `https://saga.app/campaign/abc-123` or just `abc-123`, extract the ID and navigate to `/campaign/[id]`. Use a simple `useState` + `useRouter`. Validate that the input is non-empty before navigating.

**Step 5: Visual test**

- Page loads with dark background, gold heading, parchment subtitle
- "Create Campaign" button is gold/amber, links to `/campaign/new`
- Join input accepts text, "Join" button navigates (even if target page doesn't exist yet — 404 is fine)
- Page looks good on desktop (mobile optimization is out of scope)

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: landing page with hero, CTAs, and join input"
```

---

### Task 3: Add Placeholder Pages

**Files:**
- Create: `app/campaign/new/page.tsx` — placeholder "Create Campaign" page
- Create: `app/campaign/[id]/page.tsx` — placeholder "Game Room" page
- Create: `app/campaign/[id]/lobby/page.tsx` — placeholder "Lobby" page
- Create: `app/campaign/[id]/summary/page.tsx` — placeholder "Summary" page

**Step 1: Create placeholder pages**

Each page should render a minimal centered heading indicating what it will become:
- "Create Campaign — Coming Soon"
- "Game Room — Coming Soon"
- "Lobby — Coming Soon"
- "Session Summary — Coming Soon"

All should use the dark fantasy theme (dark background, serif heading, gold text).

**Step 2: Verify navigation**

- Landing → "Create Campaign" button → `/campaign/new` → shows placeholder
- Landing → join input with "test-id" → `/campaign/test-id` → shows game room placeholder
- Manually visit `/campaign/test-id/lobby` → shows lobby placeholder
- Manually visit `/campaign/test-id/summary` → shows summary placeholder

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: placeholder pages for all routes"
```

---

## Testing Strategy

**This PR is frontend-only, so testing is visual + smoke:**

- Verify dark fantasy theme renders correctly (colors, fonts)
- Verify all pages render without errors (no console errors)
- Verify navigation between landing → campaign/new works
- Verify join input extracts ID and navigates
- Verify all placeholder routes resolve (no 404s for known routes)

No unit tests needed — pure static UI with one trivial client interaction (join navigation).

---

## Acceptance Criteria

- [ ] Dark fantasy theme applied: dark backgrounds, gold accents, serif headings, parchment text
- [ ] Fonts loaded: Cinzel (headings), Crimson Text (body serif), Inter (UI sans-serif)
- [ ] Landing page renders with hero, "Create Campaign" CTA, and join input
- [ ] Join input extracts campaign ID from URL or raw ID and navigates to `/campaign/[id]`
- [ ] "Create Campaign" button links to `/campaign/new`
- [ ] All route placeholders exist and render without errors
- [ ] `yarn build` succeeds with no errors
