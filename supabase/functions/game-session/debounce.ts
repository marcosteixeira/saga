import { sessions } from './state.ts'

export const DEBOUNCE_SECONDS = 10
const DEBOUNCE_MS = DEBOUNCE_SECONDS * 1000

/**
 * Reset the debounce timer. Clears any existing timer and starts a new one
 * that fires after DEBOUNCE_MS from now.
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
  }, DEBOUNCE_MS)
}

/**
 * Cancel the debounce timer without firing.
 */
export function cancelDebounce(campaignId: string): void {
  const session = sessions.get(campaignId)
  if (!session) return

  if (session.debounceTimer !== null) {
    clearTimeout(session.debounceTimer)
    session.debounceTimer = null
  }
}
