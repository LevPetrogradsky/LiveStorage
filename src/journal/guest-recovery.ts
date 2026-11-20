import { STORAGE_KEY } from '../data.ts'

export const guestRecoveryStorageKey = `${STORAGE_KEY}.journal-recovery-code`
export const cloudConsentKey = (storageKey: string) => `${storageKey}.journal-cloud-enabled`

export function normalizeRecoveryCode(value: string): string | null {
  const code = value.replace(/[\s-]/g, '').toLowerCase()
  return /^[0-9a-f]{64}$/.test(code) ? code : null
}

export function formatRecoveryCode(code: string): string {
  return code.match(/.{1,8}/g)?.join('-') ?? code
}

export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function readRecoveryCode(): string | null {
  try { return normalizeRecoveryCode(localStorage.getItem(guestRecoveryStorageKey) ?? '') }
  catch { return null }
}
