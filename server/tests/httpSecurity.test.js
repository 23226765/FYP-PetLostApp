import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import {
  DEVELOPMENT_CORS_ORIGINS,
  configureHttpSecurity,
  httpSecurityConfigurationMessage,
  parseCorsOrigins,
  parseTrustProxy,
  resolveHttpSecurityConfig,
} from '../config/httpSecurity.js'

async function startProbe(config) {
  const app = express()
  configureHttpSecurity(app, config)
  app.get('/api/probe', (req, res) => {
    res.json({ ip: req.ip, protocol: req.protocol, secure: req.secure })
  })
  app.get('/uploads/probe.png', (_req, res) => {
    res.type('png').send(Buffer.from('not-a-real-image'))
  })
  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({ code: error.code || 'ERROR' })
  })

  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  const address = server.address()
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

test('proxy trust rejects blanket values and accepts only explicit bounded configurations', () => {
  assert.equal(parseTrustProxy(undefined), false)
  assert.equal(parseTrustProxy('false'), false)
  assert.equal(parseTrustProxy('1'), 1)
  assert.equal(parseTrustProxy('loopback'), 'loopback')
  assert.deepEqual(parseTrustProxy('10.0.0.0/8, 192.0.2.10'), ['10.0.0.0/8', '192.0.2.10'])

  for (const unsafe of ['true', '*', 'all']) {
    assert.throws(() => parseTrustProxy(unsafe), (error) => error.code === 'TRUST_PROXY_UNSAFE')
  }
  for (const invalid of ['11', 'not-a-network', '10.0.0.0/99']) {
    assert.throws(() => parseTrustProxy(invalid), (error) => error.code === 'TRUST_PROXY_INVALID')
  }
})

test('CORS origins are exact, normalized, deduplicated, and required in production', () => {
  assert.deepEqual(parseCorsOrigins(), DEVELOPMENT_CORS_ORIGINS)
  assert.deepEqual(
    parseCorsOrigins('https://pawradar.example/,https://pawradar.example'),
    ['https://pawradar.example'],
  )
  assert.throws(
    () => parseCorsOrigins('', { production: true }),
    (error) => error.code === 'CORS_ORIGINS_REQUIRED',
  )
  for (const invalid of ['*', 'https://user:password@example.test', 'https://example.test/path']) {
    assert.throws(() => parseCorsOrigins(invalid), (error) => error.code === 'CORS_ORIGIN_INVALID')
  }
})

test('security configuration errors expose stable guidance without echoing submitted values', () => {
  const privateValue = 'private-proxy-value'
  const error = Object.assign(new Error(privateValue), { code: 'TRUST_PROXY_INVALID' })
  const message = httpSecurityConfigurationMessage(error)
  assert.equal(message.includes(privateValue), false)
  assert.equal(message, 'TRUST_PROXY must contain explicit proxy addresses, subnets, or a bounded hop count.')
})

test('development responses carry security and cache headers while preserving cross-origin uploads', async () => {
  const probe = await startProbe(resolveHttpSecurityConfig({
    NODE_ENV: 'development',
    TRUST_PROXY: 'false',
    CORS_ORIGINS: 'http://localhost:3000',
  }))
  try {
    const response = await fetch(`${probe.baseUrl}/api/probe`, {
      headers: { Origin: 'http://localhost:3000' },
    })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000')
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true')
    assert.match(response.headers.get('access-control-expose-headers') || '', /RateLimit-Limit/)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('pragma'), 'no-cache')
    assert.equal(response.headers.get('x-powered-by'), null)
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(response.headers.get('x-frame-options'), 'DENY')
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin')
    assert.equal(response.headers.get('strict-transport-security'), null)
    assert.match(response.headers.get('content-security-policy') || '', /default-src 'none'/)
    assert.doesNotMatch(response.headers.get('content-security-policy') || '', /upgrade-insecure-requests/)

    const upload = await fetch(`${probe.baseUrl}/uploads/probe.png`, {
      headers: { Origin: 'http://localhost:3000' },
    })
    assert.equal(upload.status, 200)
    assert.equal(upload.headers.get('cross-origin-resource-policy'), 'cross-origin')
  } finally {
    await probe.close()
  }
})

test('CORS preflight is explicit and disallowed origins receive a sanitized 403', async () => {
  const probe = await startProbe(resolveHttpSecurityConfig({
    TRUST_PROXY: 'false',
    CORS_ORIGINS: 'http://localhost:3000',
  }))
  try {
    const preflight = await fetch(`${probe.baseUrl}/api/probe`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    })
    assert.equal(preflight.status, 204)
    assert.match(preflight.headers.get('access-control-allow-methods') || '', /POST/)
    assert.match(preflight.headers.get('access-control-allow-headers') || '', /Authorization/i)
    assert.equal(preflight.headers.get('access-control-max-age'), '600')

    const denied = await fetch(`${probe.baseUrl}/api/probe`, {
      headers: { Origin: 'https://attacker.example' },
    })
    assert.equal(denied.status, 403)
    assert.deepEqual(await denied.json(), { code: 'CORS_ORIGIN_DENIED' })
    assert.equal(denied.headers.get('access-control-allow-origin'), null)
    assert.equal(denied.headers.get('cache-control'), 'no-store')
  } finally {
    await probe.close()
  }
})

test('forwarded headers are ignored without trust and honored only for an explicit loopback proxy', async () => {
  const forwardedHeaders = {
    'X-Forwarded-For': '203.0.113.24',
    'X-Forwarded-Proto': 'https',
  }
  const direct = await startProbe(resolveHttpSecurityConfig({
    TRUST_PROXY: 'false',
    CORS_ORIGINS: 'http://localhost:3000',
  }))
  const proxied = await startProbe(resolveHttpSecurityConfig({
    TRUST_PROXY: 'loopback',
    CORS_ORIGINS: 'http://localhost:3000',
  }))
  try {
    const directPayload = await (await fetch(`${direct.baseUrl}/api/probe`, { headers: forwardedHeaders })).json()
    assert.notEqual(directPayload.ip, '203.0.113.24')
    assert.equal(directPayload.protocol, 'http')
    assert.equal(directPayload.secure, false)

    const proxiedPayload = await (await fetch(`${proxied.baseUrl}/api/probe`, { headers: forwardedHeaders })).json()
    assert.equal(proxiedPayload.ip, '203.0.113.24')
    assert.equal(proxiedPayload.protocol, 'https')
    assert.equal(proxiedPayload.secure, true)
  } finally {
    await direct.close()
    await proxied.close()
  }
})

test('production responses enable HSTS only after explicit production CORS configuration', async () => {
  const config = resolveHttpSecurityConfig({
    NODE_ENV: 'production',
    TRUST_PROXY: 'loopback',
    CORS_ORIGINS: 'https://pawradar.example',
  })
  const probe = await startProbe(config)
  try {
    const response = await fetch(`${probe.baseUrl}/api/probe`)
    assert.equal(response.status, 200)
    assert.equal(
      response.headers.get('strict-transport-security'),
      'max-age=31536000; includeSubDomains',
    )
    assert.match(response.headers.get('content-security-policy') || '', /upgrade-insecure-requests/)
  } finally {
    await probe.close()
  }
})
