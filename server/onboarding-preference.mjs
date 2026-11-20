const defaultOrigins = [
  'https://lifeos-demo-kappa.vercel.app',
  'https://livetasks.vercel.app',
  'https://livejournal-lime.vercel.app',
]

export function createOnboardingPreferenceHandler({ verify, store, origins = defaultOrigins }) {
  const allowed = new Set(origins)
  return async function handler(request) {
    const origin = request.headers.get('origin')
    const cors = {
      'Cache-Control': 'no-store',
      Vary: 'Origin',
      ...(origin && allowed.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    }
    const json = (body, status = 200) => Response.json(body, { status, headers: cors })
    if (origin && !allowed.has(origin)) return json({ error: 'Origin not allowed.' }, 403)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      ...cors,
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '600',
    } })
    if (request.method !== 'GET' && request.method !== 'PUT') return json({ error: 'Method not allowed.' }, 405)
    const authorization = request.headers.get('authorization')
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Sign in required.' }, 401)
    const userId = await verify(authorization.slice(7))
    if (!userId) return json({ error: 'Sign in required.' }, 401)
    if (!store) return json({ error: 'Preference storage unavailable.' }, 503)
    try {
      if (request.method === 'GET') return json({ disabled: await store.read(userId) })
      if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return json({ error: 'JSON required.' }, 415)
      const body = await request.json().catch(() => null)
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.disabled !== 'boolean') {
        return json({ error: 'Invalid preference.' }, 400)
      }
      await store.write(userId, body.disabled)
      return json({ disabled: body.disabled })
    } catch {
      return json({ error: 'Preference storage unavailable.' }, 503)
    }
  }
}
