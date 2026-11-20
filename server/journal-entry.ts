import { createRemoteJWKSet, jwtVerify } from 'jose'
import { createJournalHandler } from './journal-handler.ts'
import { createJournalStore } from './journal-store.ts'

const authUrl = process.env.NEON_AUTH_BASE_URL
const databaseUrl = process.env.DATABASE_URL
const jwks = authUrl ? createRemoteJWKSet(new URL(`${authUrl.replace(/\/$/, '')}/.well-known/jwks.json`)) : null
const issuer = authUrl ? new URL(authUrl).origin : ''
const store = databaseUrl ? createJournalStore(databaseUrl) : null

const handler = createJournalHandler(async token => {
  if (!jwks) return null
  try {
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ['EdDSA'], issuer, audience: issuer,
    })
    return typeof payload.sub === 'string' && payload.sub.length > 0 ? payload.sub : null
  } catch {
    return null
  }
}, store ?? {
  list: async () => { throw new Error('Database unavailable') },
  write: async () => { throw new Error('Database unavailable') },
}, () => process.env.JOURNAL_SYNC_ENABLED === 'true' &&
  (process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_ENV === 'production'))

export default { fetch: handler }
