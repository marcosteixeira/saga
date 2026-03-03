# Deployment Guide — Saga

## Prerequisites

- [Supabase](https://supabase.com) project
- [Vercel](https://vercel.com) account
- [Anthropic API key](https://console.anthropic.com)
- [Google AI API key](https://aistudio.google.com)

---

## 1. Supabase Setup

### Create Project

1. Create a new Supabase project at https://supabase.com
2. Note your project URL and API keys from **Settings → API**

### Run Migrations

```bash
npx supabase db push
```

Or apply migrations manually from `supabase/migrations/`.

### Create Storage Bucket

Run the SQL in `supabase/storage-setup.sql` via the Supabase SQL editor:

```sql
-- See supabase/storage-setup.sql for full contents
INSERT INTO storage.buckets (id, name, public) VALUES ('campaign-images', 'campaign-images', true);
```

### Enable Realtime

In the Supabase dashboard, enable Realtime for these tables:
- `campaigns`
- `players`
- `game_events`

---

## 2. Environment Variables

Create `.env.local` for local development (never commit this file):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AIza...
```

---

## 3. Vercel Deployment

### Connect Repository

1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Framework: **Next.js** (auto-detected)

### Set Environment Variables

In the Vercel project settings under **Environment Variables**, add all vars from the list above.

### Build Configuration

- **Build Command:** `yarn build`
- **Output Directory:** `.next` (default)
- **Node.js Version:** 20.x

### Function Timeout

For AI narration streaming, increase function timeout in `vercel.json` (Pro plan supports 60s, Hobby plan is limited to 10s):

```json
{
  "functions": {
    "app/api/campaign/[id]/narrate/route.ts": {
      "maxDuration": 60
    }
  }
}
```

### Deploy

```bash
npx vercel --prod
```

Or push to the connected GitHub branch for automatic deployment.

---

## 4. Post-Deploy Verification

1. Navigate to your deployed URL
2. Create a campaign — verify world generation works
3. Open lobby link in a second browser tab
4. Join as a second player
5. Host starts session — verify opening narration streams
6. Submit player actions — verify narration triggers
7. End session — verify summary page displays
8. Check all images load (cover, map, portraits, scene images)
