import { neon } from '@neondatabase/serverless'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { createOnboardingPreferenceHandler } from '../server/onboarding-preference.mjs'

const authUrl = process.env.NEON_AUTH_BASE_URL
const databaseUrl = process.env.DATABASE_URL
const jwks = authUrl ? createRemoteJWKSet(new URL(`${authUrl.replace(/\/$/, '')}/.well-known/jwks.json`)) : null
const issuer = authUrl ? new URL(authUrl).origin : ''
const sql = databaseUrl ? neon(databaseUrl) : null
const origins = process.env.ONBOARDING_ALLOWED_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean)

const handler = createOnboardingPreferenceHandler({
  origins: origins?.length ? origins : undefined,
  verify: async token => {
    if (!jwks) return null
    try {
      const { payload } = await jwtVerify(token, jwks, { algorithms: ['EdDSA'], issuer, audience: issuer })
      return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null
    } catch { return null }
  },
  store: sql ? {
    read: async userId => {
      const rows = await sql`SELECT disable_all_onboarding FROM livehub_user_preferences WHERE user_id = ${userId}`
      return rows[0]?.disable_all_onboarding === true
    },
    write: async (userId, disabled) => {
      await sql`INSERT INTO livehub_user_preferences (user_id, disable_all_onboarding)
        VALUES (${userId}, ${disabled})
        ON CONFLICT (user_id) DO UPDATE SET disable_all_onboarding = EXCLUDED.disable_all_onboarding, updated_at = now()`
    },
  } : null,
})

export default { fetch: handler }
