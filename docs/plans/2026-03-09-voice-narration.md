# Voice Narration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Play ElevenLabs TTS audio after each GM narration round, with replay and disable controls in the game UI.

**Architecture:** A Next.js API route proxies text to ElevenLabs and streams audio back to the client. A `useVoiceNarration` hook manages playback state and `localStorage` persistence. The `round:saved` WS event triggers narration by capturing `streamingContent` via a ref before it's cleared.

**Tech Stack:** Next.js App Router API route, ElevenLabs REST API, Web Audio (`new Audio(blobUrl)`), Vitest, React Testing Library (`renderHook`)

---

### Task 1: Add `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` env vars

**Files:**
- Modify: `.env.local` (not committed)
- Modify: `.env.example` or `README` if one exists (check with `ls` at repo root)

**Step 1: Add vars to `.env.local`**

```
ELEVENLABS_API_KEY=<your_key>
ELEVENLABS_VOICE_ID=onwK4e9ZLuTAKqWW03F9
```

`onwK4e9ZLuTAKqWW03F9` is the ElevenLabs "Daniel" voice — a deep, authoritative narrator. Replace with any voice ID from your ElevenLabs dashboard.

**Step 2: Verify vars are not NEXT_PUBLIC_**

These must remain server-side only. Never prefix with `NEXT_PUBLIC_`.

**Step 3: Commit env example if it exists**

```bash
git add .env.example   # only if this file exists
git commit -m "chore: add ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID to env example"
```

---

### Task 2: Create `/api/tts` route with tests

**Files:**
- Create: `app/api/tts/route.ts`
- Create: `app/api/tts/__tests__/route.test.ts`

**Step 1: Write the failing tests**

Create `app/api/tts/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '../route'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('POST /api/tts', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('ELEVENLABS_API_KEY', 'test-key')
    vi.stubEnv('ELEVENLABS_VOICE_ID', 'test-voice-id')
  })

  it('streams audio from ElevenLabs and returns audio/mpeg', async () => {
    const fakeBody = new ReadableStream()
    mockFetch.mockResolvedValue(
      new Response(fakeBody, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' }
      })
    )

    const req = new Request('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello adventurer', voiceId: 'test-voice-id' }),
      headers: { 'content-type': 'application/json' }
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/mpeg')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.elevenlabs.io/v1/text-to-speech/test-voice-id/stream',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'xi-api-key': 'test-key',
          'content-type': 'application/json'
        })
      })
    )
  })

  it('returns 400 if text is missing', async () => {
    const req = new Request('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 500 if ElevenLabs returns non-ok', async () => {
    mockFetch.mockResolvedValue(new Response('error', { status: 429 }))
    const req = new Request('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello' }),
      headers: { 'content-type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })

  it('returns 500 if ELEVENLABS_API_KEY is missing', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', '')
    const req = new Request('http://localhost/api/tts', {
      method: 'POST',
      body: JSON.stringify({ text: 'Hello' }),
      headers: { 'content-type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
yarn test app/api/tts
```

Expected: FAIL — `Cannot find module '../route'`

**Step 3: Implement the route**

Create `app/api/tts/route.ts`:

```ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'TTS not configured' }, { status: 500 });
  }

  let body: { text?: string; voiceId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { text, voiceId } = body;
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const voice = voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? 'onwK4e9ZLuTAKqWW03F9';

  const elevenRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'content-type': 'application/json',
        accept: 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    }
  );

  if (!elevenRes.ok) {
    return NextResponse.json({ error: 'TTS upstream error' }, { status: 500 });
  }

  return new Response(elevenRes.body, {
    status: 200,
    headers: { 'content-type': 'audio/mpeg' }
  });
}
```

**Step 4: Run tests to verify they pass**

```bash
yarn test app/api/tts
```

Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add app/api/tts/route.ts app/api/tts/__tests__/route.test.ts
git commit -m "feat: add /api/tts proxy route for ElevenLabs"
```

---

### Task 3: Create `useVoiceNarration` hook with tests

**Files:**
- Create: `app/campaign/[slug]/game/hooks/useVoiceNarration.ts`
- Create: `app/campaign/[slug]/game/hooks/__tests__/useVoiceNarration.test.ts`

**Note:** No `@testing-library/react` is installed. Use `renderHook` from `@testing-library/react` — check `package.json` first. If not installed, run:
```bash
yarn add -D @testing-library/react @testing-library/dom
```

**Step 1: Write failing tests**

Create `app/campaign/[slug]/game/hooks/__tests__/useVoiceNarration.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVoiceNarration } from '../useVoiceNarration'

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Mock Audio
class MockAudio {
  src = ''
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
}
vi.stubGlobal('Audio', MockAudio)

// Mock URL.createObjectURL / revokeObjectURL
vi.stubGlobal('URL', {
  createObjectURL: vi.fn().mockReturnValue('blob:fake-url'),
  revokeObjectURL: vi.fn()
})

const mockAudioBlob = new Blob(['fake audio'], { type: 'audio/mpeg' })

describe('useVoiceNarration', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    mockFetch.mockResolvedValue(new Response(mockAudioBlob))
  })

  it('starts enabled by default', () => {
    const { result } = renderHook(() => useVoiceNarration())
    expect(result.current.enabled).toBe(true)
  })

  it('persists disabled state to localStorage', () => {
    const { result } = renderHook(() => useVoiceNarration())
    act(() => result.current.toggle())
    expect(result.current.enabled).toBe(false)
    expect(localStorage.getItem('saga:voice-narration')).toBe('false')
  })

  it('reads enabled state from localStorage on mount', () => {
    localStorage.setItem('saga:voice-narration', 'false')
    const { result } = renderHook(() => useVoiceNarration())
    expect(result.current.enabled).toBe(false)
  })

  it('speak() sets isLoading then isPlaying', async () => {
    const { result } = renderHook(() => useVoiceNarration())
    await act(async () => {
      await result.current.speak('Hello adventurer')
    })
    expect(mockFetch).toHaveBeenCalledWith('/api/tts', expect.objectContaining({
      method: 'POST'
    }))
    // After speak resolves and audio starts, isPlaying should be true
    expect(result.current.isPlaying).toBe(true)
  })

  it('speak() is a no-op when disabled', async () => {
    localStorage.setItem('saga:voice-narration', 'false')
    const { result } = renderHook(() => useVoiceNarration())
    await act(async () => {
      await result.current.speak('Hello')
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('replay() re-speaks last text', async () => {
    const { result } = renderHook(() => useVoiceNarration())
    await act(async () => { await result.current.speak('First narration') })
    mockFetch.mockClear()
    await act(async () => { await result.current.replay() })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('replay() is a no-op if no lastText', async () => {
    const { result } = renderHook(() => useVoiceNarration())
    await act(async () => { await result.current.replay() })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('stop() pauses and clears isPlaying', async () => {
    const { result } = renderHook(() => useVoiceNarration())
    await act(async () => { await result.current.speak('Hello') })
    act(() => result.current.stop())
    expect(result.current.isPlaying).toBe(false)
  })

  it('toggle() stops playback when disabling', async () => {
    const { result } = renderHook(() => useVoiceNarration())
    await act(async () => { await result.current.speak('Hello') })
    act(() => result.current.toggle())
    expect(result.current.enabled).toBe(false)
    expect(result.current.isPlaying).toBe(false)
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
yarn test app/campaign/\\[slug\\]/game/hooks
```

Expected: FAIL — module not found

**Step 3: Implement the hook**

Create `app/campaign/[slug]/game/hooks/useVoiceNarration.ts`:

```ts
'use client';

import { useState, useRef, useCallback } from 'react';

const STORAGE_KEY = 'saga:voice-narration';

export interface UseVoiceNarration {
  enabled: boolean;
  isLoading: boolean;
  isPlaying: boolean;
  lastText: string | null;
  speak: (text: string) => Promise<void>;
  replay: () => Promise<void>;
  stop: () => void;
  toggle: () => void;
}

export function useVoiceNarration(): UseVoiceNarration {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === null ? true : stored !== 'false';
    } catch {
      return true;
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastText, setLastText] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!enabled) return;
    stop();
    setLastText(text);
    setIsLoading(true);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!res.ok) {
        console.error('[voice] TTS request failed', res.status);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(url);
        blobUrlRef.current = null;
      };
      audio.onerror = () => {
        setIsPlaying(false);
        console.error('[voice] audio playback error');
      };
      setIsLoading(false);
      setIsPlaying(true);
      await audio.play();
    } catch (err) {
      console.error('[voice] speak error', err);
      setIsLoading(false);
      setIsPlaying(false);
    }
  }, [enabled, stop]);

  const replay = useCallback(async () => {
    if (!lastText) return;
    await speak(lastText);
  }, [lastText, speak]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* noop */ }
      if (!next) stop();
      return next;
    });
  }, [stop]);

  return { enabled, isLoading, isPlaying, lastText, speak, replay, stop, toggle };
}
```

**Step 4: Run tests to verify they pass**

```bash
yarn test app/campaign/\\[slug\\]/game/hooks
```

Expected: PASS (9 tests)

**Step 5: Commit**

```bash
git add app/campaign/[slug]/game/hooks/useVoiceNarration.ts \
        app/campaign/[slug]/game/hooks/__tests__/useVoiceNarration.test.ts
git commit -m "feat: add useVoiceNarration hook with localStorage persistence"
```

---

### Task 4: Capture streaming text and trigger TTS in `GameClient.tsx`

**Files:**
- Modify: `app/campaign/[slug]/game/GameClient.tsx`

The `ws.onmessage` handler is a closure and captures a stale `streamingContent` state value. We need a ref that tracks the latest value.

**Step 1: Add `streamingContentRef` near `streamingContent` state (around line 2100)**

Find this line:
```ts
const [streamingContent, setStreamingContent] = useState('');
```

Add after it:
```ts
const streamingContentRef = useRef('');
```

**Step 2: Keep the ref in sync**

Find the existing scroll `useEffect` (around line 1670). After it, add:
```ts
useEffect(() => {
  streamingContentRef.current = streamingContent;
}, [streamingContent]);
```

Actually, a cleaner approach: update the ref inline in the `setStreamingContent` calls. But since `setStreamingContent` uses functional updates in the chunk handler, the easiest approach is the `useEffect` sync above. Add it near the other `useEffect`s in the `GameClient` function (near line 2100).

**Step 3: Instantiate the hook and wire it**

Find where `useState` declarations are (around line 2093). Add the hook instantiation nearby:
```ts
const voiceNarration = useVoiceNarration();
```

Add the import at the top of the file:
```ts
import { useVoiceNarration } from './hooks/useVoiceNarration';
```

**Step 4: Update the `round:saved` handler**

Find (around line 2210):
```ts
if (msg.type === 'round:saved') {
  // Narration and action messages are delivered via Supabase Realtime
  // postgres_changes. This event only signals that streaming is done.
  console.log('[game-session] round:saved (streaming complete)');
  setIsStreaming(false);
  setStreamingContent('');
}
```

Replace with:
```ts
if (msg.type === 'round:saved') {
  // Narration and action messages are delivered via Supabase Realtime
  // postgres_changes. This event only signals that streaming is done.
  console.log('[game-session] round:saved (streaming complete)');
  const textToSpeak = streamingContentRef.current;
  setIsStreaming(false);
  setStreamingContent('');
  if (textToSpeak) voiceNarration.speak(textToSpeak);
}
```

**Step 5: Pass `voiceNarration` to `ActiveGameView`**

Find the `<ActiveGameView` JSX (search for `<ActiveGameView`). Add the prop:
```tsx
<ActiveGameView
  ...existing props...
  voiceNarration={voiceNarration}
/>
```

Update the `ActiveGameView` props interface and function signature to accept:
```ts
voiceNarration: UseVoiceNarration;
```

Add import at the top:
```ts
import type { UseVoiceNarration } from './hooks/useVoiceNarration';
```

**Step 6: Verify no TS errors**

```bash
yarn build 2>&1 | head -40
```

**Step 7: Commit**

```bash
git add app/campaign/[slug]/game/GameClient.tsx
git commit -m "feat: wire voice narration trigger on round:saved"
```

---

### Task 5: Add voice control UI to `ActiveGameView`

**Files:**
- Modify: `app/campaign/[slug]/game/GameClient.tsx` (the `ActiveGameView` component and its header)

The controls go in the header's right-side `div` (line ~1767), alongside the "Campaign Active" indicator. Use Lucide icons — check which ones are already imported with `grep -n "lucide" GameClient.tsx`.

**Step 1: Check existing Lucide imports**

```bash
grep "lucide" app/campaign/\[slug\]/game/GameClient.tsx | head -5
```

**Step 2: Add needed icons to the Lucide import**

Add `Volume2`, `VolumeX`, `RefreshCw` to the existing lucide-react import line. Example:
```ts
import { Volume2, VolumeX, RefreshCw, /* ...existing icons... */ } from 'lucide-react';
```

**Step 3: Add the voice controls JSX**

Find the header right-side div in `ActiveGameView` (around line 1767):
```tsx
<div className="flex shrink-0 items-center gap-2">
  <div
    className="h-2 w-2 rounded-full bg-patina"
    ...
  />
  <span ...>Campaign Active</span>
</div>
```

Replace with:
```tsx
<div className="flex shrink-0 items-center gap-2">
  {/* Voice controls */}
  {voiceNarration.lastText && (
    <button
      onClick={() => voiceNarration.replay()}
      disabled={voiceNarration.isLoading || voiceNarration.isPlaying}
      title="Replay narration"
      className="flex h-7 w-7 items-center justify-center text-ash/60 transition-colors hover:text-steam disabled:cursor-not-allowed disabled:opacity-40"
    >
      <RefreshCw
        size={14}
        className={voiceNarration.isLoading ? 'animate-spin' : ''}
      />
    </button>
  )}
  <button
    onClick={() => voiceNarration.toggle()}
    title={voiceNarration.enabled ? 'Disable voice narration' : 'Enable voice narration'}
    className="flex h-7 w-7 items-center justify-center text-ash/60 transition-colors hover:text-steam"
  >
    {voiceNarration.enabled ? (
      <Volume2 size={14} className={voiceNarration.isPlaying ? 'text-steam' : ''} />
    ) : (
      <VolumeX size={14} />
    )}
  </button>
  <div className="h-3 w-px bg-gunmetal" />
  <div
    className="h-2 w-2 rounded-full bg-patina"
    style={{
      boxShadow: '0 0 6px var(--patina)',
      animation: 'pulse 2s ease-in-out infinite'
    }}
  />
  <span
    className="hidden text-[10px] uppercase tracking-[0.2em] text-patina sm:block"
    style={{ fontFamily: 'var(--font-mono), monospace' }}
  >
    Campaign Active
  </span>
</div>
```

**Step 4: Verify build and visuals**

```bash
yarn build 2>&1 | head -40
yarn dev
```

Open the game room, verify:
- Speaker icon appears in header
- Click toggles to muted (VolumeX) and saves to localStorage
- After a narration round, Replay icon appears
- Clicking Replay fires the TTS request (check Network tab)

**Step 5: Commit**

```bash
git add app/campaign/[slug]/game/GameClient.tsx
git commit -m "feat: add voice narration toggle and replay controls to game header"
```

---

### Task 6: Run all tests and verify

**Step 1: Run full test suite**

```bash
yarn test
```

Expected: all existing tests pass + new TTS and hook tests pass.

**Step 2: Fix any failures before proceeding**

If the `useVoiceNarration` tests fail due to `localStorage` not available in jsdom, check `vitest.config.ts` for `environment: 'jsdom'`. If it's `node`, either add a `// @vitest-environment jsdom` comment at the top of the test file, or configure the test to use jsdom.

**Step 3: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: test environment for useVoiceNarration"
```

---

### Task 7: Final cleanup and PR

**Step 1: Check for any stray `console.log` left in production paths**

```bash
grep -n "console.log" app/campaign/\[slug\]/game/GameClient.tsx | grep -v "\[game-session\]"
```

Remove any unintentional ones.

**Step 2: Build check**

```bash
yarn build
```

Expected: no errors.

**Step 3: Final commit if needed, then open PR**

```bash
git push origin HEAD
gh pr create --title "feat: GM voice narration via ElevenLabs" --body "$(cat <<'EOF'
## Summary
- Adds ElevenLabs TTS playback after each GM narration round completes
- `/api/tts` route proxies text to ElevenLabs, keeps API key server-side
- `useVoiceNarration` hook manages playback, enabled state persisted to localStorage
- Voice toggle + replay controls in game header

## Test plan
- [ ] Run `yarn test` — all tests pass
- [ ] Start dev server, open game room
- [ ] Play a round — narration audio plays after round:saved
- [ ] Toggle voice off — no audio next round
- [ ] Toggle back on — audio resumes
- [ ] Replay button appears after first narration, works on click
- [ ] Replay button disabled while loading/playing
- [ ] Refresh page — voice enabled/disabled state preserved
EOF
)"
```
