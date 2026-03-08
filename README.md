# Saga

AI-powered tabletop RPG web platform where 1-6 players play in real-time with an AI Game Master.

The AI narrates the story, arbitrates rules (d20-based), generates scene and character images, and maintains persistent memory across sessions. Players join via a shared link — no registration required after character setup.

## Tech Stack

| Layer              | Technology                                      |
| ------------------ | ----------------------------------------------- |
| Frontend + API     | Next.js 16 (App Router) + TypeScript            |
| Styling            | Tailwind CSS v4 + shadcn/ui                     |
| Database           | Supabase (Postgres + Realtime)                  |
| Auth               | Supabase Auth (JWT)                             |
| AI — Game Master   | OpenAI GPT-4o (Responses API, conversation threading) |
| AI — World Gen     | Claude Haiku 4.5 (Anthropic)                    |
| AI — Images        | Gemini (`gemini-3-pro-image-preview`)           |
| Game transport     | WebSocket (Supabase Edge Function)              |
| Deploy             | Vercel (frontend) + Supabase (edge functions)   |

## Features

- **AI Game Master** — GPT-4o narration with stateful conversation threading via Responses API
- **World generation** — Claude Haiku builds rich world lore from a short description
- **Image generation** — Gemini generates cover art, world maps, and scene illustrations
- **Real-time multiplayer** — WebSocket edge function streams narration to all connected players
- **No friction** — Players join via shared link; Supabase Auth handles identity transparently
- **Dark fantasy theme** — Immersive UI with gold/amber accents

## Project Structure

```
saga/
├── app/                            # Next.js App Router
│   ├── page.tsx                    # Landing page
│   ├── login/page.tsx              # Auth
│   ├── profile/page.tsx            # User profile
│   ├── campaign/
│   │   ├── new/page.tsx            # Campaign creation form
│   │   └── [slug]/
│   │       ├── lobby/              # Lobby + character creation
│   │       ├── game/               # Game room (WebSocket client)
│   │       └── setup/              # Campaign setup
│   └── api/
│       ├── campaign/               # Campaign CRUD + world trigger
│       ├── world/                  # World fetch
│       └── profile/campaigns/      # Player campaign history
│
├── components/
│   ├── campaign/                   # WorldGenForm, world-vault
│   └── ui/                         # shadcn/ui primitives
│
├── lib/
│   ├── anthropic.ts                # Anthropic client
│   ├── memory.ts                   # Campaign memory file helpers
│   ├── realtime-broadcast.ts       # Supabase broadcast helpers
│   ├── supabase/                   # server + client Supabase clients
│   └── utils.ts
│
├── supabase/
│   ├── functions/
│   │   ├── game-session/           # WebSocket GM — OpenAI GPT-4o
│   │   ├── generate-world/         # World gen — Claude Haiku
│   │   └── generate-image/         # Image gen — Gemini
│   └── migrations/                 # 001–014
│
└── types/                          # Shared TypeScript types
```

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project (with Auth enabled)
- OpenAI API key
- Anthropic API key
- Google AI API key (Gemini)

### Setup

```bash
git clone https://github.com/marcosteixeira/saga.git
cd saga
yarn install
```

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
GEMINI_API_KEY=your_gemini_api_key
GENERATE_WORLD_WEBHOOK_SECRET=your_webhook_secret
GENERATE_IMAGE_WEBHOOK_SECRET=your_webhook_secret
```

```bash
yarn dev
```

### Docker

```bash
docker compose up --build
```

The app will be available at `http://localhost:3000` with hot reloading enabled.

### Tests

```bash
yarn test
```

Tests use Vitest. Edge function tests live alongside each function in `__tests__/` subdirectories.

## License

MIT
