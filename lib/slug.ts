/**
 * Generates a URL-safe slug from a campaign name.
 * Appends a random 6-char suffix to ensure uniqueness.
 */
export function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

  const suffix = Math.random().toString(36).slice(2, 8)
  return `${base || 'campaign'}-${suffix}`
}
