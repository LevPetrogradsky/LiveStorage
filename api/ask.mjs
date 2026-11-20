import { askProvider } from '../server/ask-provider.mjs'

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Referrer-Policy', 'no-referrer')
  if (request.method !== 'POST') return response.status(405).json({ result: 'invalid_request' })
  if (!request.headers['content-type']?.startsWith('application/json')) return response.status(415).json({ result: 'invalid_request' })
  const origin = request.headers.origin
  if (origin) {
    let originHost
    try { originHost = new URL(origin).host }
    catch { return response.status(403).json({ result: 'invalid_request' }) }
    if (originHost !== request.headers.host) return response.status(403).json({ result: 'invalid_request' })
  }
  const body = request.body
  if (typeof body === 'string' && body.length > 12000) return response.status(413).json({ result: 'invalid_request' })
  let parsed
  try { parsed = typeof body === 'string' ? JSON.parse(body) : body }
  catch { return response.status(400).json({ result: 'invalid_request' }) }
  if (JSON.stringify(parsed)?.length > 12000) return response.status(413).json({ result: 'invalid_request' })
  const result = await askProvider(parsed)
  return response.status(result.status).json(result.body)
}
