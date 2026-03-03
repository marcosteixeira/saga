import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const includeMessages = searchParams.get('include') === 'messages'
  const supabase = createServerSupabaseClient()

  const [campaignResult, playersResult, filesResult] = await Promise.all([
    supabase.from('campaigns').select('*').eq('id', id).single(),
    supabase.from('players').select('*').eq('campaign_id', id),
    supabase.from('campaign_files').select('*').eq('campaign_id', id),
  ])

  if (campaignResult.error || !campaignResult.data) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const response: Record<string, unknown> = {
    campaign: campaignResult.data,
    players: playersResult.data ?? [],
    files: filesResult.data ?? [],
  }

  if (includeMessages) {
    const sessionId = campaignResult.data.current_session_id
    if (!sessionId) {
      response.messages = []
    } else {
      const { data } = await supabase
        .from('game_events')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
      response.messages = data ?? []
    }
  }

  return NextResponse.json(response)
}
