import { NextResponse } from 'next/server'
import { createAuthServerClient, createServerSupabaseClient } from '@/lib/supabase/server'
import type { Campaign } from '@/types'

type ProfileCampaign = Pick<Campaign, 'id' | 'slug' | 'name' | 'status' | 'host_user_id' | 'created_at'> & {
  is_host: boolean
}

export async function GET() {
  const authClient = await createAuthServerClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()

  const { data: hostedCampaigns, error: hostError } = await supabase
    .from('campaigns')
    .select('id,slug,name,status,host_user_id,created_at')
    .eq('host_user_id', user.id)

  if (hostError) {
    return NextResponse.json(
      { error: 'Failed to fetch hosted campaigns' },
      { status: 500 }
    )
  }

  const { data: playerRows, error: playersError } = await supabase
    .from('players')
    .select('campaign_id')
    .eq('user_id', user.id)

  if (playersError) {
    return NextResponse.json(
      { error: 'Failed to fetch player campaigns' },
      { status: 500 }
    )
  }

  const hostedIds = new Set((hostedCampaigns ?? []).map((c) => c.id))
  const joinedIds = Array.from(
    new Set((playerRows ?? []).map((p) => p.campaign_id).filter((id) => !hostedIds.has(id)))
  )

  let joinedCampaigns: Array<Pick<Campaign, 'id' | 'slug' | 'name' | 'status' | 'host_user_id' | 'created_at'>> = []

  if (joinedIds.length > 0) {
    const { data, error } = await supabase
      .from('campaigns')
      .select('id,slug,name,status,host_user_id,created_at')
      .in('id', joinedIds)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch joined campaigns' },
        { status: 500 }
      )
    }

    joinedCampaigns = data ?? []
  }

  const campaigns: ProfileCampaign[] = [
    ...(hostedCampaigns ?? []).map((campaign) => ({ ...campaign, is_host: true })),
    ...joinedCampaigns.map((campaign) => ({ ...campaign, is_host: false })),
  ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))

  return NextResponse.json({ campaigns })
}
