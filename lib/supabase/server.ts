// Server client — uses service role key, bypasses RLS. Server-only (API routes + server components).
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  return createSupabaseClient(url, key)
}

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Auth-aware server client — reads the current user's session from cookies.
// Use this in API routes that need to identify the authenticated user.
// (The existing createServerSupabaseClient uses service role and bypasses RLS — keep using it for admin ops.)
export async function createAuthServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars')

  const cookieStore = await cookies()

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Silently ignore — setAll called from a Server Component where cookies are read-only.
          // Middleware handles cookie refresh instead.
        }
      },
    },
  })
}
