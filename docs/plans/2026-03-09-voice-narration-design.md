# Voice Narration Design

**Date:** 2026-03-09
**Feature:** GM voice narration via ElevenLabs TTS
**Status:** Approved

## Overview

After each GM narration round completes, the full narration text is sent to ElevenLabs and played back as audio. Players can replay the last narration or disable the feature entirely. The toggle persists across page refreshes via `localStorage`.

## Architecture

### `/app/api/tts/route.ts`

A Next.js POST route that proxies requests to ElevenLabs:

- Accepts `{ text: string, voiceId: string }`
- Calls `https://api.elevenlabs.io/v1/text-to-speech/:voiceId/stream`
- Pipes the audio stream back to the client as `audio/mpeg`
- Uses `ELEVENLABS_API_KEY` (server-side env var, never exposed to client)
- `ELEVENLABS_VOICE_ID` env var sets the default voice (no UI voice picker)

### `useVoiceNarration` hook

**Location:** `app/campaign/[slug]/game/hooks/useVoiceNarration.ts`

State:
- `enabled: boolean` — persisted to `localStorage` key `saga:voice-narration`
- `isPlaying: boolean`
- `isLoading: boolean`
- `lastText: string | null` — text of the last narration (for replay)

Methods:
- `speak(text: string)` — POSTs to `/api/tts`, creates a Blob URL, plays via `new Audio(url)`
- `replay()` — calls `speak(lastText)` if available
- `stop()` — pauses and cleans up current audio
- `toggle()` — flips `enabled`, stops playback if disabling

### Trigger Point in `GameClient.tsx`

In the `ws.onmessage` handler, on `round:saved`:

```ts
if (msg.type === 'round:saved') {
  const textToSpeak = streamingContent; // capture before clearing
  setIsStreaming(false);
  setStreamingContent('');
  if (textToSpeak) voiceNarration.speak(textToSpeak);
}
```

### UI Controls

Added to `ActiveGameView`, positioned in the top-right of the game feed header (or a small floating bar):

- **Voice toggle button** — speaker icon, shows enabled/disabled state
- **Replay button** — visible only when `lastText` is set, disabled while `isLoading` or `isPlaying`
- **Loading indicator** — subtle spinner on the toggle while `isLoading`

## Data Flow

```
round:saved (WebSocket)
  → capture streamingContent
  → POST /api/tts { text, voiceId: process.env.ELEVENLABS_VOICE_ID }
      → ElevenLabs streams audio/mpeg
      → Next.js route pipes stream back
  → client: Response.arrayBuffer() → Blob URL → new Audio(url) → .play()
  → audio.onended: isPlaying=false
```

## Error Handling

- TTS fetch failure: log error, silently skip — game is uninterrupted
- Audio playback failure: same — silent fail, replay button remains available
- No automatic retry — user can use Replay manually
- If `enabled` is false: `speak()` is a no-op

## Environment Variables

```env
ELEVENLABS_API_KEY=        # Server-side only
ELEVENLABS_VOICE_ID=       # Default voice ID (e.g. "onwK4e9ZLuTAKqWW03F9" for Daniel)
```

## Testing

**Unit — `/api/tts` route:**
- Mock `fetch` to ElevenLabs; verify correct headers forwarded
- Verify `audio/mpeg` content-type in response
- Verify 500 returned on ElevenLabs error

**Unit — `useVoiceNarration`:**
- Mock `fetch` + `Audio`; verify `speak` sets `isLoading → isPlaying → idle`
- Verify `replay()` re-uses `lastText`
- Verify `stop()` clears playback state
- Verify `toggle()` persists to `localStorage`

**Manual:**
- Toggle off mid-stream → no audio plays
- Toggle back on → next round plays
- Replay after page refresh → button disabled (no lastText in memory), re-enables after next round
