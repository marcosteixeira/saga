import { NextResponse } from 'next/server';
import { createAuthServerClient } from '@/lib/supabase/server';

// Default ElevenLabs voice (Daniel — deep, narrative fantasy tone)
const DEFAULT_VOICE_ID = 'onwK4e9ZLuTAKqWW03F9';

const MAX_TEXT_LENGTH = 5000;

export async function POST(req: Request) {
  const authClient = await createAuthServerClient();
  const {
    data: { user }
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'TTS not configured' }, { status: 500 });
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { text } = body;
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: 'text exceeds maximum length' }, { status: 400 });
  }

  const voice = process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID;

  console.log(
    JSON.stringify({ level: 'info', event: 'tts_invoke', userId: user.id, textLength: text.length })
  );

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
    console.error(
      JSON.stringify({ level: 'error', event: 'tts_upstream_error', status: elevenRes.status })
    );
    return NextResponse.json(
      { error: 'TTS upstream error' },
      { status: elevenRes.status >= 500 ? 502 : elevenRes.status }
    );
  }

  return new Response(elevenRes.body, {
    status: 200,
    headers: { 'content-type': 'audio/mpeg' }
  });
}
