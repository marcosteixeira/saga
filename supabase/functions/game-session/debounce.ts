import { sessions } from './state.ts'

export const DEBOUNCE_SECONDS = 8

/**
 * Reset the debounce timer for a campaign. Clears any existing timer and
 * sets a new one. Calls onFire when the debounce period expires.
 */
export function resetDebounce(campaignId: string, onFire: () => void): void {
  const session = sessions.get(campaignId)
  if (!session) return

  if (session.debounceTimer !== null) {
    clearTimeout(session.debounceTimer)
  }

  session.debounceTimer = setTimeout(() => {
    session.debounceTimer = null
    onFire()
  }, DEBOUNCE_SECONDS * 1000)
}

/**
 * Cancel the debounce timer for a campaign without firing.
 */
export function cancelDebounce(campaignId: string): void {
  const session = sessions.get(campaignId)
  if (!session) return

  if (session.debounceTimer !== null) {
    clearTimeout(session.debounceTimer)
    session.debounceTimer = null
  }
}
