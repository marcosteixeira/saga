import { NextResponse } from 'next/server';
import {
  createServerSupabaseClient,
  createAuthServerClient
} from '@/lib/supabase/server';

export async function POST(req: Request) {
  const authClient = await createAuthServerClient();
  const {
    data: { user }
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { name, description } = body;

  if (!name || !description) {
    return NextResponse.json(
      { error: 'Missing required fields: name, description' },
      { status: 400 }
    );
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('worlds')
    .insert({
      user_id: user.id,
      name,
      description,
      status: 'generating'
    })
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create world' }, { status: 500 });
  }

  const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-world`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.GENERATE_WORLD_WEBHOOK_SECRET) {
    headers.authorization = `Bearer ${process.env.GENERATE_WORLD_WEBHOOK_SECRET}`;
  }

  // Fire-and-forget
  fetch(functionUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      record: { id: data.id, description }
    })
  }).catch((err) => {
    console.error('[generate-world] fire-and-forget fetch failed:', err);
  });

  return NextResponse.json({ id: data.id }, { status: 201 });
}

export async function GET(_req: Request) {
  const authClient = await createAuthServerClient();
  const {
    data: { user }
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('worlds')
    .select('id, name, description, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch worlds' }, { status: 500 });
  }

  return NextResponse.json({ worlds: data });
}
