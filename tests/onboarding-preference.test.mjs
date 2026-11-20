import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createOnboardingPreferenceHandler } from '../server/onboarding-preference.mjs'

const origin = 'https://livetasks.vercel.app'
const request = (method, body, token = 'good', requestOrigin = origin) => new Request('https://lifeos-demo-kappa.vercel.app/api/onboarding-preference', {
  method,
  headers: { Origin: requestOrigin, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
})

test('account preference is scoped to the verified user and never accepted from an unknown origin', async () => {
  const values = new Map()
  const handler = createOnboardingPreferenceHandler({
    verify: async token => token === 'good' ? 'user-one' : token === 'other' ? 'user-two' : null,
    store: { read: async id => values.get(id) ?? false, write: async (id, value) => values.set(id, value) },
  })
  assert.equal((await handler(request('GET', null, null))).status, 401)
  assert.equal((await handler(request('GET', null, 'bad'))).status, 401)
  assert.equal((await handler(request('PUT', { disabled: true }, 'good', 'https://unknown.example'))).status, 403)
  assert.equal((await handler(request('PUT', { disabled: 'true' }))).status, 400)
  assert.deepEqual(await (await handler(request('PUT', { disabled: true }))).json(), { disabled: true })
  assert.deepEqual(await (await handler(request('GET'))).json(), { disabled: true })
  assert.deepEqual(await (await handler(request('GET', null, 'other'))).json(), { disabled: false })
  const preflight = await handler(request('OPTIONS', null, null))
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin)
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/)
})
