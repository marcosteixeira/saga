'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

export function useTurnTimer(
  timerSeconds: number,
  onExpire: () => void
): {
  timeRemaining: number
  isActive: boolean
  reset: () => void
} {
  const [timeRemaining, setTimeRemaining] = useState(timerSeconds)
  const [isActive, setIsActive] = useState(true)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  const reset = useCallback(() => {
    setTimeRemaining(timerSeconds)
    setIsActive(true)
  }, [timerSeconds])

  useEffect(() => {
    if (!isActive) return
    if (timeRemaining <= 0) {
      setIsActive(false)
      onExpireRef.current()
      return
    }
    const id = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(id)
          setIsActive(false)
          onExpireRef.current()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [isActive, timeRemaining])

  return { timeRemaining, isActive, reset }
}
