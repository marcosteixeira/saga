import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerSupabaseClient()

  const [campaignResult, playersResult, filesResult] = await Promise.all([
    supabase.from('campaigns').select('*').eq('id', id).single(),
    supabase.from('players').select('*').eq('campaign_id', id),
    supabase.from('campaign_files').select('*').eq('campaign_id', id),
  ])

  if (campaignResult.error || !campaignResult.data) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  return NextResponse.json({
    campaign: campaignResult.data,
    players: playersResult.data ?? [],
    files: filesResult.data ?? [],
  })
}
