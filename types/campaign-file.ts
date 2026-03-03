export type CampaignFile = {
  id: string
  campaign_id: string
  filename: string
  content: string
  updated_at: string
}

export type CampaignFileInsert = Pick<
  CampaignFile,
  'campaign_id' | 'filename'
> & {
  content?: string
}
