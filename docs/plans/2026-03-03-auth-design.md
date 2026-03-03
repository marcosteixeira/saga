# Authentication Design

_Created: 2026-03-03 | Brainstormed with Claude_

---

## Goal

Add Supabase magic-link authentication for both hosts and players. Replace the current session-token-in-localStorage pattern with proper Supabase Auth (`auth.users`). Enables host campaign ownership, player persistence across sessions, and lays the groundwork for future "see all my campaigns/characters" dashboard.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Auth method | Supabase Magic Link (`signInWithOtp`) | Passwordless, zero friction, no password management |
| Auth UI | Custom form (Option B) | Fits existing steampunk design system; auth-ui-react would need heavy theme overrides |
| Identity for sessions | `auth.users.id` FK in campaigns + players tables | Replaces UUID session tokens |
| Display name | Optional field on campaign form; falls back to email | Users can set a persona, but it's not required |
| Player auth | Full magic link for players too | Required for future "see all my characters" feature |

## Architecture

**New server client:** Add `createAuthServerClient()` in `lib/supabase/server.ts` using `@supabase/ssr`'s `createServerClient` with cookie access. This reads the authenticated user in API routes. The existing service-role client stays for internal admin operations.

**Middleware:** `middleware.ts` at project root protects `/campaign/new`, `/campaign/[id]/lobby`, and `/campaign/[id]/game`. Unauthenticated requests redirect to `/login?redirect=<original-path>`.

**Auth callback:** `/auth/callback/route.ts` exchanges the OTP code from the magic link email for a session cookie, then redirects to `?redirect` param or `/`.

## Database Changes

```sql
-- campaigns: replace session token with auth user reference
ALTER TABLE campaigns
  DROP COLUMN host_session_token,
  ADD COLUMN host_user_id UUID REFERENCES auth.users(id) NOT NULL;

-- players: replace session token with auth user reference
ALTER TABLE players
  DROP COLUMN session_token,
  ADD COLUMN user_id UUID REFERENCES auth.users(id) NOT NULL;

-- RLS on campaigns
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read campaigns" ON campaigns FOR SELECT USING (true);
CREATE POLICY "host can update own campaign" ON campaigns FOR UPDATE USING (auth.uid() = host_user_id);
CREATE POLICY "host can delete own campaign" ON campaigns FOR DELETE USING (auth.uid() = host_user_id);
CREATE POLICY "authenticated users can insert campaigns" ON campaigns FOR INSERT WITH CHECK (auth.uid() = host_user_id);

-- RLS on players
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read players" ON players FOR SELECT USING (true);
CREATE POLICY "player can update own row" ON players FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "authenticated users can insert players" ON players FOR INSERT WITH CHECK (auth.uid() = user_id);
```

## Pages & Routes

| Path | Status | Description |
|---|---|---|
| `app/login/page.tsx` | New | Email input → magic link → "check your inbox" confirmation state. Steampunk styled. |
| `app/auth/callback/route.ts` | New | Exchanges OTP code for session cookie, redirects to `?redirect` or `/` |
| `middleware.ts` | New | Protects `/campaign/new`, `/campaign/[id]/lobby`, `/campaign/[id]/game` |
| `lib/supabase/server.ts` | Modify | Add `createAuthServerClient()` with SSR cookie support |
| `app/api/campaign/route.ts` | Modify | Get `user_id` from auth session instead of generating token; derive `host_username` from display name or email |
| `types/campaign.ts` | Modify | Replace `host_session_token: string` with `host_user_id: string` |
| `types/player.ts` | Modify | Replace `session_token: string` with `user_id: string` |
| `components/campaign/WorldGenForm.tsx` | Modify | "Your Name" becomes optional display name (falls back to email); remove `localStorage` token storage |

## Campaign Form Changes (`WorldGenForm.tsx`)

- "Your Name" field stays but becomes **optional** — a display name, not identity
- If left blank, the API uses `user.email` as `host_username`
- Remove `localStorage.setItem('saga_session_token', ...)` — no token to store
- Remove `host_session_token` from the POST body
- Form still redirects to `/campaign/[id]/lobby` on success

## Out of Scope

- "See all my campaigns/characters" dashboard — future feature
- OAuth providers (Google, GitHub) — future addition on top of this
- Profile editing
