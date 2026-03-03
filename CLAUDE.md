# CLAUDE.md — Saga

## Project
AI-powered tabletop RPG platform. 1-6 players play in real-time with an AI Game Master (Claude Sonnet 4.6). No auth required — players join via shared link with a username.

## Stack
- **Framework:** Next.js 16 (App Router) + TypeScript
- **Styling:** Tailwind CSS + shadcn/ui (dark fantasy theme — dark backgrounds, gold/amber accents)
- **Database:** Supabase (Postgres + Realtime broadcast)
- **AI — GM:** Claude Sonnet 4.6 (Anthropic SDK)
- **AI — Images:** Gemini (`gemini-3-pro-image-preview`)
- **Deploy:** Vercel
- **Tests:** Vitest

## Key Conventions
- App Router only — no Pages Router
- All AI calls server-side (API routes) — never expose keys to client
- Streaming via Supabase Realtime broadcast (avoids Vercel timeout limits)
- Image generation only when AI tags `GENERATE_IMAGE` in response
- d20 roll system by default; host can override with plain text
- HP only (max 20). 0 = incapacitated, massive damage = dead
- Turn modes: `free` (exploration) | `sequential` (combat)
- Memory system: multi-file MD (WORLD, CHARACTERS, NPCS, LOCATIONS, MEMORY)

## Database
Key tables: `campaigns`, `players`, `game_sessions`, `game_events`, `gm_memory`
See `DESIGN.md` for full schema.

## Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
GOOGLE_AI_API_KEY
```

## Dev Setup
```bash
yarn install
yarn dev          # http://localhost:3000
docker compose up --build  # with Docker
```

## Supabase
Migrations in `supabase/`. Apply with:
```bash
npx supabase db push
```

## Git Rules
- Never commit to `main` directly — always feature branches
- Conventional Commits: `feat:`, `fix:`, `chore:`, etc.
- Never commit secrets or `.env.local`
