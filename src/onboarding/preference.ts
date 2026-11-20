const endpoint = '/api/onboarding-preference'

export async function readAccountOnboardingPreference(getToken: () => Promise<string | null>): Promise<boolean | null> {
  try {
    const token = await getToken()
    if (!token) return null
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    if (!response.ok) return null
    const body: unknown = await response.json()
    return body && typeof body === 'object' && 'disabled' in body && typeof body.disabled === 'boolean' ? body.disabled : null
  } catch { return null }
}

export async function writeAccountOnboardingPreference(getToken: () => Promise<string | null>, disabled: boolean): Promise<boolean> {
  try {
    const token = await getToken()
    if (!token) return false
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled }),
      cache: 'no-store',
    })
    return response.ok && (await response.json() as { disabled?: unknown }).disabled === disabled
  } catch { return false }
}
