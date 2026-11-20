import { STORAGE_KEY } from '../data.ts'

export type OnboardingMode = 'first-run' | 'preview' | null

export function completionKey(storageKey = STORAGE_KEY) {
  return `${storageKey}.onboarding.v1`
}

export function initialOnboardingMode(
  storageKey = STORAGE_KEY,
  storage: Pick<Storage, 'getItem'> = localStorage,
  search = typeof window === 'undefined' ? '' : window.location.search,
  existingAccount = false,
): OnboardingMode {
  if (new URLSearchParams(search).get('onboarding') === 'preview') return 'preview'
  if (existingAccount) return null
  try {
    // Existing LifePortable data predates onboarding. Never interrupt those users.
    if (storage.getItem(storageKey) !== null || storage.getItem(completionKey(storageKey)) === 'done') return null
    return 'first-run'
  } catch {
    return null
  }
}

export function requestOnboardingFeedback() {
  try {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(8)
  } catch {
    // Haptics are optional and must not interrupt navigation.
  }
}
