'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

export function ProfileLink() {
  const supabase = useMemo(() => createClient(), [])
  const [user, setUser] = useState<User | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      data.subscription.unsubscribe()
    }
  }, [supabase])

  if (!user || pathname?.includes('/game')) return null

  const displayName = user.user_metadata?.display_name || 'Profile'

  return (
    <Link
      href="/profile"
      className="fixed right-6 top-6 z-50 rounded border border-gunmetal bg-smog/80 px-3 py-2 text-xs uppercase tracking-[0.12em] text-steam transition-colors hover:border-brass hover:text-brass"
      style={{ fontFamily: 'var(--font-mono), monospace' }}
    >
      {displayName}
    </Link>
  )
}
