import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerSupabaseClient()

  // Accept either a UUID (id) or a slug
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  const campaignQuery = isUuid
    ? supabase.from('campaigns').select('*, worlds(*)').eq('id', id).single()
    : supabase.from('campaigns').select('*, worlds(*)').eq('slug', id).single()

  const campaignResult = await campaignQuery
  if (campaignResult.error || !campaignResult.data) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const campaignId = campaignResult.data.id

  const [playersResult, filesResult] = await Promise.all([
    supabase.from('players').select('*').eq('campaign_id', campaignId),
    supabase.from('campaign_files').select('*').eq('campaign_id', campaignId),
  ])

  if (campaignResult.error || !campaignResult.data) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Separate world from campaign for a clean response shape
  const { worlds: world, ...campaign } = campaignResult.data

  return NextResponse.json({
    campaign,
    world,
    players: playersResult.data ?? [],
    files: filesResult.data ?? [],
  })
}
