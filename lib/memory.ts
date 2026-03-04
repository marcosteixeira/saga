import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { CampaignFile } from '@/types'

export async function getCampaignFile(
  campaignId: string,
  filename: string
): Promise<string | null> {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('campaign_files')
    .select('content')
    .eq('campaign_id', campaignId)
    .eq('filename', filename)
    .single()
  if (error || !data) return null
  return data.content
}

export async function getCampaignFiles(campaignId: string): Promise<CampaignFile[]> {
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('campaign_files')
    .select('*')
    .eq('campaign_id', campaignId)
  return data ?? []
}

export async function upsertCampaignFile(
  campaignId: string,
  filename: string,
  content: string
): Promise<void> {
  const supabase = createServerSupabaseClient()
  await supabase
    .from('campaign_files')
    .upsert(
      { campaign_id: campaignId, filename, content },
      { onConflict: 'campaign_id,filename' }
    )
}

export async function initializeCampaignFiles(campaignId: string): Promise<void> {
  const supabase = createServerSupabaseClient()
  const files = [
    { campaign_id: campaignId, filename: 'CHARACTERS.md', content: '' },
    { campaign_id: campaignId, filename: 'NPCS.md', content: '' },
    { campaign_id: campaignId, filename: 'LOCATIONS.md', content: '' },
    { campaign_id: campaignId, filename: 'MEMORY.md', content: 'Campaign just started.' },
  ]
  for (const file of files) {
    await supabase
      .from('campaign_files')
      .upsert(file, { onConflict: 'campaign_id,filename' })
  }
}
