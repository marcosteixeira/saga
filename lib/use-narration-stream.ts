'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface NarrationStreamState {
  isStreaming: boolean
  streamingContent: string
  streamingMessageId: string | null
}

export function useNarrationStream(campaignId: string): NarrationStreamState {
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)

  const handleChunk = useCallback((payload: { type: string; content: string; messageId: string }) => {
    setIsStreaming(true)
    setStreamingMessageId(payload.messageId)
    setStreamingContent(prev => prev + payload.content)
  }, [])

  const handleDone = useCallback((_payload: { type: string; messageId: string; fullContent: string }) => {
    setIsStreaming(false)
    setStreamingContent('')
    setStreamingMessageId(null)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`campaign:${campaignId}:narration`)
      .on('broadcast', { event: 'chunk' }, ({ payload }) => {
        handleChunk(payload)
      })
      .on('broadcast', { event: 'done' }, ({ payload }) => {
        handleDone(payload)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [campaignId, handleChunk, handleDone])

  return { isStreaming, streamingContent, streamingMessageId }
}
