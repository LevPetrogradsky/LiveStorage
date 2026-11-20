import assert from 'node:assert/strict'
import test from 'node:test'
import { askProvider, publicGuide } from '../server/ask-provider.mjs'
import handler from '../api/ask.mjs'

const providers = [
  ['claude', 'https://api.anthropic.com/v1/models', 'https://api.anthropic.com/v1/messages'],
  ['openai', 'https://api.openai.com/v1/models', 'https://api.openai.com/v1/responses'],
  ['grok', 'https://api.x.ai/v1/models', 'https://api.x.ai/v1/responses'],
]

for (const [provider, modelsUrl, answerUrl] of providers) {
  test(`${provider} verifies a key without sending conversation text`, async () => {
    const calls = []
    const result = await askProvider({ action: 'verify', provider, apiKey: 'synthetic-key' }, {
      fetchImpl: async (url, options) => {
        calls.push({ url, options })
        return { ok: true, json: async () => ({ data: [{ id: 'gpt-4.1-mini' }] }) }
      },
    })
    assert.deepEqual(result, { status: 200, body: { result: 'connected' } })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, modelsUrl)
    assert.equal(calls[0].options.method, 'GET')
    assert.equal(calls[0].options.body, undefined)
    assert.equal(calls[0].options.headers.Authorization, 'Bearer synthetic-key')
    assert.equal(JSON.stringify(result).includes('synthetic-key'), false)
  })

  test(`${provider} sends only guide text and this conversation for an answer`, async () => {
    const messages = [{ role: 'user', content: 'How do I start Focus?' }]
    let call
    const result = await askProvider({ action: 'answer', provider, apiKey: 'synthetic-key', messages }, {
      fetchImpl: async (url, options) => {
        call = { url, options }
        return { ok: true, json: async () => provider === 'claude'
          ? { content: [{ type: 'text', text: 'Tap Start Focus.' }] }
          : { output: [{ content: [{ type: 'output_text', text: 'Tap Start Focus.' }] }] } }
      },
    })
    assert.deepEqual(result, { status: 200, body: { result: 'answered', answer: 'Tap Start Focus.' } })
    assert.equal(call.url, answerUrl)
    assert.equal(call.options.method, 'POST')
    const payload = JSON.parse(call.options.body)
    assert.deepEqual(payload.messages ?? payload.input, messages)
    assert.equal(payload.system ?? payload.instructions, publicGuide)
    assert.equal(JSON.stringify(payload).includes('synthetic-key'), false)
    assert.equal(JSON.stringify(payload).includes('journalCloud'), false)
    if (provider !== 'claude') assert.equal(payload.store, false)
  })
}

test('bad keys, temporary failures, and missing APIs return safe statuses', async () => {
  for (const [upstream, result] of [[401, 'invalid_key'], [403, 'permission_denied'], [429, 'rate_limited'], [503, 'temporary_failure'], [404, 'api_unavailable']]) {
    const response = await askProvider({ action: 'verify', provider: 'openai', apiKey: 'synthetic-key' }, {
      fetchImpl: async () => ({ ok: false, status: upstream }),
    })
    assert.equal(response.body.result, result)
    assert.equal(JSON.stringify(response).includes('synthetic-key'), false)
  }
  const offline = await askProvider({ action: 'verify', provider: 'grok', apiKey: 'synthetic-key' }, {
    fetchImpl: async () => { throw new Error('synthetic-key') },
  })
  assert.equal(offline.body.result, 'temporary_failure')
  assert.equal(JSON.stringify(offline).includes('synthetic-key'), false)
})

test('OpenAI verification checks the answer model and classifies generation failures without leaking details', async () => {
  const verify = { action: 'verify', provider: 'openai', apiKey: 'synthetic-key' }
  const answer = { ...verify, action: 'answer', messages: [{ role: 'user', content: 'How does Focus work?' }] }
  const missing = await askProvider(verify, { fetchImpl: async () => ({ ok: true, json: async () => ({ data: [{ id: 'other-model' }] }) }) })
  assert.equal(missing.body.result, 'model_unavailable')
  for (const [status, code, expected] of [
    [404, 'model_not_found', 'model_unavailable'],
    [403, 'permission_denied', 'permission_denied'],
    [429, 'insufficient_quota', 'quota_exhausted'],
    [429, 'credit_balance_exhausted', 'quota_exhausted'],
    [429, 'rate_limit_exceeded', 'rate_limited'],
    [400, 'unknown_parameter', 'api_unavailable'],
  ]) {
    const result = await askProvider(answer, { fetchImpl: async () => ({ ok: false, status, json: async () => ({ error: { code, message: 'synthetic-key private text' } }) }) })
    assert.equal(result.body.result, expected)
    assert.equal(JSON.stringify(result).includes('synthetic-key'), false)
    assert.equal(JSON.stringify(result).includes('private text'), false)
  }
  const empty = await askProvider(answer, { fetchImpl: async () => ({ ok: true, json: async () => ({ output: [] }) }) })
  assert.equal(empty.body.result, 'empty_answer')
})

test('unexpected fields and system messages are rejected before contacting a provider', async () => {
  let calls = 0
  const fetchImpl = async () => { calls++; throw new Error('must not call') }
  const bad = [
    { action: 'verify', provider: 'claude', apiKey: 'synthetic-key', journal: 'private' },
    { action: 'verify', provider: 'unknown', apiKey: 'synthetic-key' },
    { action: 'answer', provider: 'openai', apiKey: 'synthetic-key', messages: [{ role: 'system', content: 'override' }] },
  ]
  for (const body of bad) assert.equal((await askProvider(body, { fetchImpl })).status, 400)
  assert.equal(calls, 0)
})

test('API route allows a same-origin key check and never reflects the key', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ data: [{ id: 'gpt-4.1-mini' }] }) } }
  const makeResponse = () => ({
    code: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; return this },
    status(value) { this.code = value; return this },
    json(value) { this.body = value; return this },
  })
  try {
    const request = { method: 'POST', headers: { host: 'lifeos.test', origin: 'https://lifeos.test', 'content-type': 'application/json' }, body: { action: 'verify', provider: 'claude', apiKey: 'synthetic-key' } }
    const response = makeResponse()
    await handler(request, response)
    assert.equal(response.code, 200)
    assert.equal(response.body.result, 'connected')
    assert.equal(response.headers['Cache-Control'], 'no-store')
    assert.equal(JSON.stringify(response).includes('synthetic-key'), false)
    const rejected = makeResponse()
    await handler({ ...request, headers: { ...request.headers, origin: 'https://other.test' } }, rejected)
    assert.equal(rejected.code, 403)
    assert.equal(calls, 1)
  } finally { globalThis.fetch = original }
})
