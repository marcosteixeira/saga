import { NextResponse } from 'next/server';
import { createAuthServerClient } from '@/lib/supabase/server';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

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
    JSON.stringify({
      level: 'info',
      event: 'tts_invoke',
      userId: user.id,
      textLength: text.length
    })
  );

  try {
    const client = new ElevenLabsClient({ apiKey });
    const audioStream = await client.textToSpeech.stream(voice, {
      text,
      modelId: 'eleven_v3',
      voiceSettings: { stability: 0.5, similarityBoost: 0.75 },
    });

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of audioStream) {
            controller.enqueue(chunk);
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    });
  } catch (err) {
    console.error(
      JSON.stringify({ level: 'error', event: 'tts_upstream_error', error: String(err) })
    );
    return NextResponse.json({ error: 'TTS upstream error' }, { status: 502 });
  }
}
