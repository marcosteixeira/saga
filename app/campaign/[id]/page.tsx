'use client'
import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  useEffect(() => {
    fetch(`/api/campaign/${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.campaign?.status === 'lobby') router.replace(`/campaign/${id}/lobby`)
        if (data.campaign?.status === 'ended') router.replace(`/campaign/${id}/summary`)
      })
  }, [id, router])

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="font-mono text-[--ash] animate-pulse">Loading...</p>
    </main>
  )
}
