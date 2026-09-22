import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const directory = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(directory, '../.env') })

const baseUrl = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:5000/api'
const password = process.env.SEED_USER_PASSWORD
if (!password) throw new Error('SEED_USER_PASSWORD is required for preference verification.')

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const payload = await response.json().catch(() => ({}))
  return { status: response.status, payload }
}

async function login(email) {
  const response = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  })
  assert.equal(response.status, 200, `login failed for ${email}`)
  return response.payload.token
}

const scenarios = [
  ['fyp.owner@pawradar.test', { language: 'en', theme: 'light' }],
  ['fyp.finder@pawradar.test', { language: 'zh-HK', theme: 'dark' }],
  ['fyp.shelter@pawradar.test', { language: 'en', theme: 'dark' }],
]

for (const [email, expected] of scenarios) {
  const token = await login(email)
  const privacyBefore = await request('/auth/me/privacy', { token })
  const update = await request('/auth/me/preferences', {
    method: 'PATCH', token, body: expected,
  })
  assert.equal(update.status, 200)
  assert.deepEqual(update.payload.preferences, expected)

  const read = await request('/auth/me/preferences', { token })
  assert.equal(read.status, 200)
  assert.deepEqual(read.payload.preferences, expected)

  const me = await request('/auth/me', { token })
  assert.equal(me.status, 200)
  assert.deepEqual(me.payload.user.preferences, expected)

  const privacyAfter = await request('/auth/me/privacy', { token })
  assert.deepEqual(privacyAfter.payload.privacy, privacyBefore.payload.privacy)
}

const ownerToken = await login('fyp.owner@pawradar.test')
const invalid = await request('/auth/me/preferences', {
  method: 'PATCH', token: ownerToken, body: { language: 'fr' },
})
assert.equal(invalid.status, 400)
assert.equal(invalid.payload.code, 'UNSUPPORTED_LANGUAGE')

const crossAccount = await request('/auth/me/preferences', {
  method: 'PATCH',
  token: ownerToken,
  body: { userId: 'another-user', theme: 'dark' },
})
assert.equal(crossAccount.status, 400)
assert.equal(crossAccount.payload.code, 'UNEXPECTED_PREFERENCE_FIELD')

console.log('PASS account preferences persist for all fyp-demo-v1 users')
console.log('PASS invalid, unexpected, and cross-account fields are rejected')
console.log('PASS contact privacy remains unchanged')
