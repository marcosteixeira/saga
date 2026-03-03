# PR 15: Polish + Vercel Deploy

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Final polish, error handling, edge cases, and deployment to Vercel. Make the app production-ready for demo purposes.

**Architecture:** This PR focuses on robustness, not features. Error boundaries, loading states, edge case handling, and Vercel deployment configuration.

**Tech Stack:** Next.js, Vercel, Supabase

**Depends on:** All previous PRs

---

### Task 1: Error Boundaries and Loading States

**Files:**
- Create: `app/error.tsx` — global error boundary
- Create: `app/loading.tsx` — global loading state
- Create: `app/campaign/[id]/error.tsx` — campaign-specific error boundary
- Create: `app/not-found.tsx` — custom 404 page

**Spec:**

Error boundary displays:
- Dark fantasy themed error page
- "Something went wrong" message with a "Try Again" button
- For campaign-specific errors: "Campaign not found" or "Session expired"

Loading states:
- Skeleton screens matching the page layout
- Dark fantasy themed spinners/shimmer

404 page:
- "Lost in the void..." with dark fantasy styling
- Link back to landing page

**Step 1: Implement all error/loading pages**

**Step 2: Visual test**

- Force an error → error boundary renders
- Slow network → loading state appears
- Visit invalid URL → 404 page renders

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: error boundaries, loading states, and 404 page"
```

---

### Task 2: Edge Case Handling

**Files:**
- Various API routes and components

**Edge cases to handle:**

1. **Player reconnection:** When a player refreshes the page, they should reconnect to the game seamlessly (session token in localStorage identifies them)

2. **Stale session tokens:** If a player's session token doesn't match any player in the campaign, show a "rejoin" option

3. **Campaign not found:** Graceful handling when navigating to a non-existent campaign ID

4. **Empty states:**
   - Message feed with no messages: "The adventure has not yet begun..."
   - Player list with only host: "Waiting for adventurers to join..."
   - No scene image: nothing shown (already handled)

5. **Long content handling:**
   - Very long player actions: truncate display, expand on click
   - Very long narrations: render fully (no truncation for GM text)
   - Very long world descriptions: scroll within containers

6. **Concurrent submissions:** If two players submit at nearly the same time, both should be saved (the turn tracker handles this)

**Step 1: Implement each edge case fix**

Go through each case, verify current behavior, add handling where missing.

**Step 2: Commit**

```bash
git add -A && git commit -m "fix: edge case handling for reconnection, stale tokens, empty states"
```

---

### Task 3: Supabase Storage Bucket Setup

**Files:**
- Create: `supabase/storage-setup.sql` (or document manual setup)

**Spec:**

Create Supabase Storage bucket for campaign images:
- Bucket name: `campaign-images`
- Public access: yes (images need to be viewable by all players)
- Max file size: 10MB

This needs to be set up in the Supabase dashboard or via SQL:
```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('campaign-images', 'campaign-images', true);
```

**Step 1: Document or script the storage setup**

**Step 2: Commit**

```bash
git add -A && git commit -m "docs: Supabase storage bucket setup"
```

---

### Task 4: Environment and Deployment Configuration

**Files:**
- Modify: `next.config.ts` — image domains, env validation
- Create: `vercel.json` (if needed)

**Spec:**

**next.config.ts updates:**
- Add Supabase Storage domain to `images.remotePatterns` (for `next/image`)
- Add any other image domains (Gemini output URLs if they're different)

**Vercel configuration:**
- Function timeout: set to maximum for narration streaming (Vercel Pro: 60s, Hobby: 10s)
- Environment variables: document all required vars
- Build command: `npm run build`
- Output directory: default (`.next`)

**Vercel env vars to set:**
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
GEMINI_API_KEY
```

**Step 1: Update next.config.ts**

**Step 2: Create deployment documentation**

Document in a `DEPLOY.md` or in the README:
- Supabase project setup steps
- Run migrations
- Create storage bucket
- Vercel deployment steps
- Environment variable configuration

**Step 3: Commit**

```bash
git add -A && git commit -m "chore: deployment configuration for Vercel"
```

---

### Task 5: Final Build Verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

**Step 2: Run production build**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 3: Run production server locally**

Run: `npm start`
Expected: App loads, navigate through all pages.

**Step 4: Manual smoke test**

Walk through the full user flow:
1. Landing page loads
2. Create campaign → world generated
3. Join with a second browser/tab
4. Start session → opening narration streams
5. Submit actions → narration triggers
6. End session → summary displays
7. Verify all images load (cover, map, portraits, scene)

**Step 5: Deploy to Vercel**

```bash
npx vercel --prod
```

Or connect GitHub repo and deploy via Vercel dashboard.

**Step 6: Post-deploy smoke test**

Run the same manual smoke test on the deployed URL.

**Step 7: Commit any final fixes**

```bash
git add -A && git commit -m "fix: final polish and deployment fixes"
```

---

## Testing Strategy

| What | How | Detail |
|------|-----|--------|
| Error boundaries | Visual/manual | Force errors, verify boundary renders |
| Loading states | Visual/manual | Throttle network, verify skeletons |
| 404 page | Visual/manual | Visit invalid URL |
| Edge cases | Visual/manual | Each edge case scenario |
| Full test suite | vitest | All unit tests pass |
| Production build | npm run build | No build errors |
| End-to-end flow | Manual | Full game session on deployed app |

---

## Acceptance Criteria

- [ ] Error boundaries render gracefully for all error types
- [ ] Loading states shown during data fetches
- [ ] Custom 404 page with dark fantasy theme
- [ ] Edge cases handled: reconnection, stale tokens, empty states
- [ ] Supabase storage bucket documented/scripted
- [ ] next.config.ts configured for image domains
- [ ] All tests pass (`npx vitest run`)
- [ ] Production build succeeds (`npm run build`)
- [ ] Successfully deployed to Vercel
- [ ] Full game flow works on deployed app
