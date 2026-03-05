export type ImageStatus = 'pending' | 'generating' | 'ready' | 'failed'

export type ImageEntityType = 'world' | 'campaign' | 'player' | 'message'

export type ImageType = 'cover' | 'map' | 'scene' | 'character' | 'inline'

export type Image = {
  id: string
  entity_type: ImageEntityType
  entity_id: string
  image_type: ImageType
  status: ImageStatus
  storage_path: string | null
  public_url: string | null
  error: string | null
  created_at: string
  updated_at: string
}

export type ImageInsert = Pick<Image, 'entity_type' | 'entity_id' | 'image_type'>
