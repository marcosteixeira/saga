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
