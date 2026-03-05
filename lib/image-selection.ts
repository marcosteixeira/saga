export type ImageRowLike = {
  entity_type: string
  entity_id: string
  image_type: string
  public_url: string | null
  created_at?: string | null
}

export function pickLatestImageUrl(
  rows: ImageRowLike[] | null | undefined,
  entityType: string,
  entityId: string,
  imageType: string,
): string | null {
  if (!rows?.length) return null

  let latestUrl: string | null = null
  let latestTime = Number.NEGATIVE_INFINITY

  for (const row of rows) {
    if (
      row.entity_type !== entityType ||
      row.entity_id !== entityId ||
      row.image_type !== imageType ||
      !row.public_url
    ) {
      continue
    }

    const time = row.created_at ? Date.parse(row.created_at) : Number.NEGATIVE_INFINITY
    if (time >= latestTime) {
      latestTime = time
      latestUrl = row.public_url
    }
  }

  return latestUrl
}
