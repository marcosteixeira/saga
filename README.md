# Saga

AI-powered tabletop RPG web platform where 1-6 players play in real-time with an AI Game Master.

The AI narrates the story, arbitrates rules (d20-based), generates scene and character images, and maintains persistent memory across sessions. Players join via a shared link — no registration required.

## Tech Stack

| Layer          | Technology                         |
| -------------- | ---------------------------------- |
| Frontend + API | Next.js 14 (App Router) + TypeScript |
| Styling        | Tailwind CSS + shadcn/ui          |
| Database       | Supabase (Postgres + Realtime)    |
| AI — Game Master | Claude Sonnet 4.6 (Anthropic)   |
| AI — Images    | Gemini                            |
| Deploy         | Vercel                            |

## Features

- **AI Game Master** — Claude-powered narration with persistent multi-session memory
- **Real-time multiplayer** — Supabase Realtime broadcast for live game updates
- **Image generation** — AI-generated cover art, maps, character portraits, and scene illustrations
- **Two play modes** — Free exploration and sequential combat (d20-based)
- **No auth required** — Players join with just a username via shared link
- **Dark fantasy theme** — Immersive UI with gold/amber accents

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project
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
ANTHROPIC_API_KEY=your_anthropic_api_key
GOOGLE_AI_API_KEY=your_google_ai_api_key
```

```bash
yarn dev
```

## License

MIT
