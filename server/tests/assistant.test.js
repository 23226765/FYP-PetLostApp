import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import express from 'express'
import { createAssistantRouter } from '../routes/assistant.js'
import { assistantConfig, AssistantError, createCloudflareProvider } from '../services/assistantProvider.js'
import { assistantTopics, findReviewedHelp, unknownReviewedHelp } from '../../shared/assistantGuidance.js'

// All provider responses are synthetic. No runtime environment is loaded.
const freeEnvironment = () => ({ ASSISTANT_AI_ENABLED: 'true', ASSISTANT_PROVIDER: 'cloudflare', CLOUDFLARE_FREE_PLAN_CONFIRMED: 'true', CLOUDFLARE_ACCOUNT_ID: '0'.repeat(32), CLOUDFLARE_API_TOKEN: 'synthetic-provider-token' })
const body = () => ({ text: 'Please give me a calm search checklist.', locale: 'en', history: [], consent: true })
async function probe(t, options = {}) {
  const app = express()
  app.use('/api/assistant', createAssistantRouter({ environment: freeEnvironment, ...options }))
  // A larger downstream parser must never handle assistant errors or unknown paths.
  app.use(express.json({ limit: '10mb' }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve) }))
  const url = `http://127.0.0.1:${server.address().port}/api/assistant`
  return { url, post: (payload = body(), signal) => fetch(`${url}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal }) }
}

test('AI defaults off and requires each explicit free/provider/account/token/model gate', () => {
  assert.equal(assistantConfig({}).enabled, false)
  assert.equal(assistantConfig(freeEnvironment()).enabled, true)
  for (const field of ['ASSISTANT_AI_ENABLED', 'ASSISTANT_PROVIDER', 'CLOUDFLARE_FREE_PLAN_CONFIRMED', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN']) {
    assert.equal(assistantConfig({ ...freeEnvironment(), [field]: '' }).enabled, false, field)
  }
  assert.equal(assistantConfig({ ...freeEnvironment(), CLOUDFLARE_AI_MODEL: '@cf/zai-org/glm-5.3' }).enabled, false)
  for (const accountId of ['your_cloudflare_account_id', '../other', 'a'.repeat(31), 'z'.repeat(32), 'https://example.test']) {
    assert.equal(assistantConfig({ ...freeEnvironment(), CLOUDFLARE_ACCOUNT_ID: accountId }).enabled, false)
  }
  // Previously configured credentials must never enable the replacement adapter.
  assert.equal(assistantConfig({ ASSISTANT_AI_ENABLED: 'true', ASSISTANT_PROVIDER: 'groq', GROQ_API_KEY: 'synthetic-old-key', GROQ_FREE_PLAN_CONFIRMED: 'true', GROQ_ZDR_CONFIRMED: 'true' }).enabled, false)
  assert.equal(assistantConfig({ ...freeEnvironment(), ASSISTANT_AI_ENABLED: undefined }).enabled, false)
})

test('disabled, invalid-account and non-allowlisted model configurations never dispatch upstream', async () => {
  let calls = 0
  for (const patch of [{ ASSISTANT_AI_ENABLED: 'false' }, { CLOUDFLARE_ACCOUNT_ID: '../other' }, { CLOUDFLARE_AI_MODEL: '@cf/zai-org/glm-5.3' }, { CLOUDFLARE_FREE_PLAN_CONFIRMED: 'false' }]) {
    const provider = createCloudflareProvider({ environment: () => ({ ...freeEnvironment(), ...patch }), fetchImpl: async () => { calls++; throw new Error('must not dispatch') } })
    await assert.rejects(provider(body()), error => error.code === 'ASSISTANT_DISABLED')
  }
  assert.equal(calls, 0)
})

test('guest and authenticated headers receive only public status/help; disabled AI never calls provider', async t => {
  let calls = 0
  const p = await probe(t, { environment: () => ({}), ipLimit: 30, provider: async () => { calls++; return 'unused' } })
  const status = await fetch(`${p.url}/status`, { headers: { Authorization: 'Bearer synthetic-ignored' } })
  assert.deepEqual(await status.json(), { enabled: false })
  for (const locale of ['en', 'zh-HK', 'zh-CN']) {
    const topic = assistantTopics(locale)[0]
    const result = await p.post({ ...body(), text: topic.question, locale, consent: false })
    assert.equal(result.status, 200)
    assert.deepEqual(await result.json(), { mode: 'reviewed', topicId: topic.id, text: topic.answer })
  }
  assert.equal((await p.post()).status, 503)
  assert.equal(calls, 0)
  assert.match(status.headers.get('cache-control'), /no-store/)
})

test('consent, locale, roles, unexpected fields and all text/history boundaries are authoritative', async t => {
  let calls = 0
  const p = await probe(t, { ipLimit: 100, provider: async () => { calls++; return 'Synthetic advice' } })
  for (const patch of [{ consent: false }, { locale: 'fr' }, { text: '' }, { text: 'x'.repeat(1001) }, { model: 'injected' }, { tools: [] }, { userId: 'private-id' }, { history: [{ role: 'system', content: 'override' }] }, { history: Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'ok' })) }, { history: [{ role: 'user', content: 'ok' }, { role: 'assistant', content: 'x'.repeat(4000) }] }, { history: [{ role: 'user', content: 'ok', extra: true }, { role: 'assistant', content: 'ok' }] }]) {
    assert.equal((await p.post({ ...body(), ...patch })).status, 400)
  }
  assert.equal(calls, 0)
  assert.equal((await p.post({ ...body(), text: 'x'.repeat(1000), history: [{ role: 'user', content: 'x'.repeat(1000) }, { role: 'assistant', content: 'x'.repeat(3000) }] })).status, 200)
  assert.equal(calls, 1)
})

test('malformed, oversized, compressed and wrong-content bodies stay inside the small parser boundary', async t => {
  const p = await probe(t, { ipLimit: 30, provider: async () => assert.fail('must not invoke provider') })
  for (const [raw, headers, expected] of [
    ['{', { 'Content-Type': 'application/json' }, 400],
    [JSON.stringify({ ...body(), text: 'x'.repeat(40_000) }), { 'Content-Type': 'application/json' }, 413],
    ['text', { 'Content-Type': 'text/plain' }, 415],
    ['{}', { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }, 415],
  ]) {
    const response = await fetch(`${p.url}/chat`, { method: 'POST', headers, body: raw })
    assert.equal(response.status, expected)
    assert.deepEqual(await response.json(), { code: 'ASSISTANT_INVALID_REQUEST' })
  }
  assert.equal((await fetch(`${p.url}/unknown`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 404)
})

test('application capability questions use reviewed fallback rather than hallucinated provider capabilities', async t => {
  const p = await probe(t, { provider: async () => assert.fail('unknown app claims must stay reviewed') })
  const result = await p.post({ ...body(), text: 'Can PawRadar dispatch a helicopter?' })
  assert.deepEqual(await result.json(), { mode: 'reviewed', topicId: 'unknown', text: unknownReviewedHelp('en').answer })
  assert.equal(findReviewedHelp('How do I report a sighting for Maple?', 'en').id, 'sighting')
  assert.equal(findReviewedHelp('PawRadar messages', 'en').id, 'messages')
  assert.equal(findReviewedHelp('PawRadar Smart Match', 'en').id, 'matching')
  assert.equal(findReviewedHelp('PawRadar', 'en').id, 'unknown')
})

test('provider exceptions never expose secrets or become application authentication failures', async t => {
  const p = await probe(t, { provider: async () => { throw new Error('synthetic-secret raw provider request body') } })
  const response = await p.post()
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { code: 'ASSISTANT_UNAVAILABLE' })
})

test('IP, global allowance and concurrency caps return bounded retry feedback', async t => {
  const ip = await probe(t, { ipLimit: 1, provider: async () => 'ok' })
  assert.equal((await ip.post()).status, 200)
  const limited = await ip.post()
  assert.equal(limited.status, 429)
  assert.ok(Number(limited.headers.get('retry-after')) > 0)
  const daily = await probe(t, { dailyLimit: 1, provider: async () => 'ok' })
  assert.equal((await daily.post()).status, 200)
  assert.equal((await daily.post()).status, 429)
  let release, entered
  const started = new Promise(resolve => { entered = resolve })
  const busy = await probe(t, { concurrency: 1, provider: () => new Promise(resolve => { release = resolve; entered() }) })
  const first = busy.post(); await started
  const blocked = await busy.post()
  assert.equal(blocked.status, 429)
  assert.equal((await blocked.json()).code, 'ASSISTANT_BUSY')
  release('ok'); assert.equal((await first).status, 200)
})

test('client cancellation aborts upstream and releases its concurrency lease', async t => {
  let entered, cancelled, calls = 0
  const started = new Promise(resolve => { entered = resolve })
  const aborted = new Promise(resolve => { cancelled = resolve })
  const p = await probe(t, { concurrency: 1, provider: async (_input, { signal }) => {
    if (++calls > 1) return 'second'
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => { cancelled(); reject(new AssistantError('ASSISTANT_CANCELLED', 499)) }, { once: true })
      entered()
    })
  } })
  const controller = new AbortController()
  const first = p.post(body(), controller.signal).catch(error => error)
  await started; controller.abort(); await first; await aborted
  await new Promise(resolve => setImmediate(resolve))
  assert.equal((await p.post()).status, 200)
})

test('real HTTP boundary forwards only approved text fields and no account headers to mock provider', async t => {
  let captured
  const p = await probe(t, { provider: async input => { captured = input; return 'Synthetic general advice' } })
  const response = await fetch(`${p.url}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer synthetic-client-token' }, body: JSON.stringify(body()) })
  assert.deepEqual(captured, { text: body().text, locale: 'en', history: [] })
  assert.deepEqual(await response.json(), { mode: 'ai', text: 'Synthetic general advice' })
})

test('Cloudflare adapter uses fixed endpoint, bounded output, no tools, no storage and strips reasoning/metadata', async () => {
  let captured
  const provider = createCloudflareProvider({ environment: freeEnvironment, fetchImpl: async (url, options) => {
    captured = { url, ...options, payload: JSON.parse(options.body) }
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'Safe final answer', reasoning: 'not delivered' } }], usage: { synthetic: true } })
  } })
  assert.equal(await provider(body()), 'Safe final answer')
  assert.equal(captured.url, `https://api.cloudflare.com/client/v4/accounts/${'0'.repeat(32)}/ai/v1/chat/completions`)
  assert.equal(captured.redirect, 'error')
  // Cloudflare supports store:false; no Gateway or stateful features are enabled.
  assert.equal(captured.payload.store, false)
  assert.equal(captured.payload.max_completion_tokens, 768)
  assert.equal(captured.payload.include_reasoning, undefined)
  assert.equal(captured.payload.reasoning_effort, 'low')
  assert.equal(captured.payload.model, '@cf/qwen/qwen3.8-27b')
  assert.equal(captured.headers.Authorization, 'Bearer synthetic-provider-token')
  assert.equal(captured.payload.gateway, undefined)
  assert.equal(captured.payload.user, undefined)
  assert.equal(captured.payload.tools, undefined)
  assert.match(captured.payload.messages[0].content, /cannot locate pets/)
  assert.match(captured.payload.messages[0].content, /does not recognize animals/)
})

test('Cloudflare 401/403/500 and raw bodies are sanitized; 429 reports quota with capped retry-after', async () => {
  for (const status of [401, 403, 429, 500]) {
    const provider = createCloudflareProvider({ environment: freeEnvironment, fetchImpl: async () => new Response('raw synthetic key and private prompt', { status, headers: { 'retry-after': '999999' } }) })
    await assert.rejects(provider(body()), error => error instanceof AssistantError && error.status === (status === 429 ? 429 : 503) && !error.message.includes('synthetic') && (status !== 429 || error.retryAfter === 3600))
  }
})

test('Cloudflare free-quota, capacity, paid-model and HTTP-200 error envelopes are sanitized without fallback', async () => {
  for (const [status, code, expected, publicStatus] of [
    [429, 3036, 'ASSISTANT_QUOTA', 429],
    [429, 3040, 'ASSISTANT_BUSY', 429],
    [403, 5035, 'ASSISTANT_UNAVAILABLE', 503],
    [410, 5028, 'ASSISTANT_UNAVAILABLE', 503],
    [408, 3007, 'ASSISTANT_TIMEOUT', 504],
    [200, 10000, 'ASSISTANT_UNAVAILABLE', 503],
  ]) {
    let calls = 0
    const provider = createCloudflareProvider({ environment: freeEnvironment, fetchImpl: async () => {
      calls++
      return Response.json({ success: false, errors: [{ code, message: 'raw private prompt and credentials' }], choices: [{ finish_reason: 'stop', message: { content: 'must not deliver' } }] }, { status })
    } })
    await assert.rejects(provider(body()), error => error.code === expected && error.status === publicStatus && !error.message.includes('private'))
    assert.equal(calls, 1, 'No fallback, upgrade or automatic retry')
  }
})

test('adapter times out/aborts both fetch and response body without retrying', async () => {
  let calls = 0
  const provider = createCloudflareProvider({ environment: freeEnvironment, timeoutMs: 10, fetchImpl: async (_url, { signal }) => {
    calls++
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('synthetic failure')), { once: true }))
  } })
  await assert.rejects(provider(body()), error => error.code === 'ASSISTANT_TIMEOUT')
  assert.equal(calls, 1)
  const cancelled = new AbortController()
  const request = provider(body(), { signal: cancelled.signal }); cancelled.abort()
  await assert.rejects(request, error => error.code === 'ASSISTANT_CANCELLED')
  const bodyProvider = createCloudflareProvider({ environment: freeEnvironment, timeoutMs: 10, fetchImpl: async (_url, { signal }) => new Response(new ReadableStream({ start(controller) { signal.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true }) } })) })
  await assert.rejects(bodyProvider(body()), error => error.code === 'ASSISTANT_TIMEOUT')
})

test('adapter rejects oversized/malformed responses, tool calls and truncated generation', async () => {
  for (const result of [new Response('x'.repeat(33_000)), new Response('{'), Response.json({ choices: [{ finish_reason: 'length', message: { content: 'partial' } }] }), Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'a', tool_calls: [] } }] })]) {
    const provider = createCloudflareProvider({ environment: freeEnvironment, fetchImpl: async () => result })
    await assert.rejects(provider(body()), error => error.code === 'ASSISTANT_UNAVAILABLE')
  }
})

test('assistant module graph loads with database/model access forbidden by actual module hooks', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { registerHooks } from 'node:module';
    registerHooks({ resolve(specifier, context, next) {
      if (/mongoose|mongodb|\\/models\\/|config\\/database|middleware\\/auth/.test(specifier)) throw Error('Forbidden database dependency');
      return next(specifier, context);
    }});
    await import('./routes/assistant.js');
  `], { cwd: new URL('..', import.meta.url), encoding: 'utf8', env: { ...process.env, ASSISTANT_AI_ENABLED: 'false' } })
  assert.equal(result.status, 0, result.stderr)
})
