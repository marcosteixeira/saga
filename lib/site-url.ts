/**
 * Returns the canonical origin for the current deployment.
 *
 * Priority:
 *  1. NEXT_PUBLIC_SITE_URL  – explicit override (set in Vercel for production env)
 *  2. NEXT_PUBLIC_VERCEL_URL – injected by Vercel at build time for every deployment
 *  3. window.location.origin – runtime fallback (localhost dev)
 *  4. http://localhost:3000  – static fallback (SSR / tests)
 *
 * This ensures magic-link emailRedirectTo URLs are correct for localhost,
 * Vercel preview deployments, and production alike.
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL
  }
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
  }
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return 'http://localhost:3000'
}
