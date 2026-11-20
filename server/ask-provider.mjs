const providers = {
  claude: {
    modelsUrl: 'https://api.anthropic.com/v1/models',
    answerUrl: 'https://api.anthropic.com/v1/messages',
    model: 'claude-haiku-4-5-20251001',
    headers: key => ({ Authorization: `Bearer ${key}`, 'anthropic-version': '2026-10-21' }),
  },
  openai: {
    modelsUrl: 'https://api.openai.com/v1/models',
    answerUrl: 'https://api.openai.com/v1/responses',
    model: 'gpt-4.1-mini',
    headers: key => ({ Authorization: `Bearer ${key}` }),
  },
  grok: {
    modelsUrl: 'https://api.x.ai/v1/models',
    answerUrl: 'https://api.x.ai/v1/responses',
    model: 'grok-4.7',
    headers: key => ({ Authorization: `Bearer ${key}` }),
  },
}

export const publicGuide = 'You are Ask LifePortable. Answer only questions about using the LifePortable hub and its linked services. Keep answers concise. You cannot access or inspect the user’s tasks, Journal, account, or other private app data. Do not claim that you can. If a question needs private data, explain that the user can check it inside the relevant service.'

function validMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 9) return false
  if (messages.at(-1)?.role !== 'user') return false
  let total = 0
  for (const message of messages) {
    if (!message || (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.content !== 'string' || !message.content.trim() || message.content.length > 600) return false
    total += message.content.length
  }
  return total <= 4000
}

function statusForUpstream(status, code) {
  if (status === 401) return 'invalid_key'
  if (status === 403) return 'permission_denied'
  if (code === 'model_not_found') return 'model_unavailable'
  if (status === 429) {
    if (['insufficient_quota', 'credit_balance_exhausted', 'organization_spend_limit_exceeded',
      'project_spend_limit_exceeded', 'organization_usage_limit_exceeded'].includes(code)) return 'quota_exhausted'
    return 'rate_limited'
  }
  if (status === 408 || status === 409 || status >= 500) return 'temporary_failure'
  return 'api_unavailable'
}

async function upstreamCode(response) {
  try {
    const value = await response.json()
    return typeof value?.error?.code === 'string' ? value.error.code : ''
  } catch { return '' }
}

function parseAnswer(provider, value) {
  if (provider === 'claude') return value?.content?.filter(item => item?.type === 'text').map(item => item.text).join('\n').trim()
  return value?.output?.flatMap(item => item?.content ?? []).filter(item => item?.type === 'output_text').map(item => item.text).join('\n').trim()
}

export async function askProvider(body, { fetchImpl = fetch } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
    Object.keys(body).some(key => !['action', 'provider', 'apiKey', 'messages'].includes(key))) return { status: 400, body: { result: 'invalid_request' } }
  const { action, provider, apiKey, messages } = body
  const config = Object.hasOwn(providers, provider) ? providers[provider] : null
  if (!config || (action !== 'verify' && action !== 'answer') || typeof apiKey !== 'string' ||
    !apiKey.trim() || apiKey.length > 512 || /[\r\n]/.test(apiKey) ||
    (action === 'verify' && messages !== undefined) || (action === 'answer' && !validMessages(messages))) {
    return { status: 400, body: { result: 'invalid_request' } }
  }

  const verify = action === 'verify'
  const url = verify ? config.modelsUrl : config.answerUrl
  const headers = { ...config.headers(apiKey.trim()), ...(verify ? {} : { 'Content-Type': 'application/json' }) }
  const payload = verify ? undefined : provider === 'claude'
    ? { model: config.model, max_tokens: 350, system: publicGuide, messages }
    : { model: config.model, instructions: publicGuide, input: messages, max_output_tokens: 350, store: false }
  let response
  try {
    response = await fetchImpl(url, {
      method: verify ? 'GET' : 'POST', headers, body: payload && JSON.stringify(payload),
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(verify ? 10000 : 45000),
    })
  } catch {
    return { status: 503, body: { result: 'temporary_failure' } }
  }
  if (!response.ok) {
    const result = statusForUpstream(response.status, await upstreamCode(response))
    return { status: response.status === 401 ? 401 : response.status === 403 ? 403 :
      result === 'temporary_failure' ? 503 : result === 'rate_limited' || result === 'quota_exhausted' ? 429 : 502,
    body: { result } }
  }
  try {
    const value = await response.json()
    if (verify) {
      if (!Array.isArray(value?.data)) throw new Error('Invalid model list')
      if (provider === 'openai' && !value.data.some(model => model?.id === config.model)) {
        return { status: 502, body: { result: 'model_unavailable' } }
      }
      return { status: 200, body: { result: 'connected' } }
    }
    const answer = parseAnswer(provider, value)
    if (typeof answer !== 'string' || !answer) return { status: 502, body: { result: 'empty_answer' } }
    return { status: 200, body: { result: 'answered', answer: answer.slice(0, 4000) } }
  } catch {
    return { status: 502, body: { result: 'api_unavailable' } }
  }
}
