import { NextRequest, NextResponse } from 'next/server'
import { createAuthServerClient, createServerSupabaseClient } from '@/lib/supabase/server'

// Only allowed transitions
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  paused: ['ended'],
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = await createAuthServerClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: campaignId } = await params
  const supabase = createServerSupabaseClient()
  const body = await request.json().catch(() => ({}))
  const { status: newStatus } = body

  // Fetch campaign
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, status, host_user_id')
    .eq('id', campaignId)
    .single()

  if (!campaign || campaignError) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Check host
  if (campaign.host_user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Validate transition
  const allowed = ALLOWED_TRANSITIONS[campaign.status] ?? []
  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from '${campaign.status}' to '${newStatus}'` },
      { status: 400 }
    )
  }

  // Apply transition
  const { error: updateError } = await supabase
    .from('campaigns')
    .update({ status: newStatus })
    .eq('id', campaignId)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
  }

  return NextResponse.json({ status: newStatus }, { status: 200 })
}
