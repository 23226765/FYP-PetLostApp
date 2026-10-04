import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import User from '../models/User.js'
import { requireAuth } from '../middleware/auth.js'
import {
  createRateLimiter,
  registrationRateLimit,
  resetRateLimitsForTests,
} from '../middleware/rateLimit.js'

const TEST_SECRET = 'Cedar!Rate-Limit-Authorization-Tests-2026'
const originalSecret = process.env.JWT_SECRET
const originalFindById = User.findById
const users = new Map()
let server
let baseUrl

function containsProhibitedPrivateField(value) {
  if (Array.isArray(value)) return value.some(containsProhibitedPrivateField)
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, nested]) => (
    ['password', 'passwordHash', 'jwtSecret', 'token', 'coordinates', 'phone', 'email'].includes(key)
    || containsProhibitedPrivateField(nested)
  ))
}

before(async () => {
  process.env.JWT_SECRET = TEST_SECRET
  User.findById = async (id) => users.get(String(id)) || null

  const roleStore = new Map()
  const roleLimiter = createRateLimiter({
    windowMs: 60_000,
    store: roleStore,
    limits: [
      { name: 'test-user', limit: 1, key: (req) => String(req.user._id) },
      { name: 'test-ip', limit: 20, key: (req) => req.ip },
    ],
  })

  const app = express()
  app.use(express.json())
  app.post('/register-attempt', registrationRateLimit, (_req, res) => res.status(400).json({ code: 'INVALID_TEST_BODY' }))
  app.post('/role-mutation', requireAuth, roleLimiter, (req, res) => {
    res.json({ id: String(req.user._id), role: req.user.role })
  })
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  const address = server.address()
  baseUrl = `http://127.0.0.1:${address.port}`
})

beforeEach(() => {
  resetRateLimitsForTests()
})

after(async () => {
  User.findById = originalFindById
  if (originalSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalSecret
  if (server) await new Promise((resolve) => server.close(resolve))
})

test('fixed-window limiter returns standard headers, blocks at the limit, and resets safely', () => {
  let timestamp = 10_000
  const store = new Map()
  const limiter = createRateLimiter({
    windowMs: 1_000,
    store,
    now: () => timestamp,
    limits: [{ name: 'ip', limit: 2, key: (req) => req.ip }],
  })
  const request = { ip: '127.0.0.1' }

  function invoke() {
    const headers = new Map()
    let statusCode = 200
    let payload
    let continued = false
    const response = {
      set: (name, value) => headers.set(name, value),
      status(code) { statusCode = code; return this },
      json(body) { payload = body; return this },
    }
    limiter(request, response, () => { continued = true })
    return { continued, headers, payload, statusCode }
  }

  const first = invoke()
  const second = invoke()
  const blocked = invoke()

  assert.equal(first.continued, true)
  assert.equal(first.headers.get('RateLimit-Limit'), '2')
  assert.equal(first.headers.get('RateLimit-Remaining'), '1')
  assert.equal(second.headers.get('RateLimit-Remaining'), '0')
  assert.equal(blocked.statusCode, 429)
  assert.equal(blocked.headers.get('Retry-After'), '1')
  assert.deepEqual(blocked.payload, {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many requests. Please try again later.',
  })

  timestamp += 1_001
  assert.equal(invoke().continued, true)
})

test('limiter storage stays bounded while identities remain independent', () => {
  const store = new Map()
  const limiter = createRateLimiter({
    windowMs: 60_000,
    store,
    maxBuckets: 3,
    limits: [{ name: 'ip', limit: 1, key: (req) => req.ip }],
  })
  const response = { set() {}, status() { return this }, json() { return this } }

  for (let index = 0; index < 8; index += 1) {
    let continued = false
    limiter({ ip: `192.0.2.${index}` }, response, () => { continued = true })
    assert.equal(continued, true)
    assert.ok(store.size <= 3)
  }
})

test('registration attempts are limited per IP without reaching a database mutation', async () => {
  for (let count = 0; count < 5; count += 1) {
    const response = await fetch(`${baseUrl}/register-attempt`, { method: 'POST' })
    assert.equal(response.status, 400)
    assert.equal(response.headers.get('ratelimit-remaining'), String(4 - count))
  }

  const blocked = await fetch(`${baseUrl}/register-attempt`, { method: 'POST' })
  const payload = await blocked.json()
  assert.equal(blocked.status, 429)
  assert.equal(payload.code, 'RATE_LIMITED')
  assert.equal(containsProhibitedPrivateField(payload), false)
})

test('guest is rejected before mutation limiting and authenticated roles have isolated account buckets', async () => {
  const guest = await fetch(`${baseUrl}/role-mutation`, { method: 'POST' })
  assert.equal(guest.status, 401)
  assert.equal(containsProhibitedPrivateField(await guest.json()), false)

  const roles = [
    ['owner', 'user'],
    ['reporter', 'user'],
    ['unrelated', 'user'],
    ['shelter_admin', 'shelter_admin'],
  ]

  for (const [label, role] of roles) {
    const id = new mongoose.Types.ObjectId()
    users.set(String(id), { _id: id, name: label, role, email: `${label}@private.test` })
    const token = jwt.sign({ id: String(id) }, TEST_SECRET, { expiresIn: '5m' })
    const options = { method: 'POST', headers: { authorization: `Bearer ${token}` } }

    const allowed = await fetch(`${baseUrl}/role-mutation`, options)
    const allowedPayload = await allowed.json()
    assert.equal(allowed.status, 200, label)
    assert.deepEqual(allowedPayload, { id: String(id), role }, label)
    assert.equal(containsProhibitedPrivateField(allowedPayload), false, label)

    const blocked = await fetch(`${baseUrl}/role-mutation`, options)
    const blockedPayload = await blocked.json()
    assert.equal(blocked.status, 429, label)
    assert.equal(blockedPayload.code, 'RATE_LIMITED', label)
    assert.equal(containsProhibitedPrivateField(blockedPayload), false, label)
  }
})
