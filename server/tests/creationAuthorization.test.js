import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import User from '../models/User.js'
import petsRouter from '../routes/pets.js'
import straysRouter from '../routes/strays.js'
import chatRouter from '../routes/chat.js'
import { requireAuth } from '../middleware/auth.js'

const TEST_SECRET = 'Cedar!Meadow-Authorization-Tests-2026'
const originalSecret = process.env.JWT_SECRET
const originalFindById = User.findById
const users = new Map()
let server
let baseUrl

before(async () => {
  process.env.JWT_SECRET = TEST_SECRET
  User.findById = async (id) => users.get(String(id)) || null

  const app = express()
  app.use(express.json())
  app.get('/role-matrix', requireAuth, (req, res) => {
    res.json({ id: String(req.user._id), role: req.user.role })
  })
  app.use('/api/pets', petsRouter)
  app.use('/api/strays', straysRouter)
  app.use('/api/chat', chatRouter)
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  const address = server.address()
  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  User.findById = originalFindById
  if (originalSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalSecret
  if (server) await new Promise((resolve) => server.close(resolve))
})

async function request(path, { token, body = {} } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

test('every report, sighting, comment, and message creation route rejects guests before database access', async () => {
  const objectId = new mongoose.Types.ObjectId().toString()
  const protectedWrites = [
    '/api/pets/report',
    `/api/pets/${objectId}/sighting`,
    '/api/strays/report',
    `/api/strays/${objectId}/comments`,
    `/api/chat/${objectId}`,
  ]

  for (const path of protectedWrites) {
    const response = await request(path)
    assert.equal(response.status, 401, path)
    assert.deepEqual(await response.json(), { error: 'Authentication required' }, path)
  }
})

test('invalid bearer tokens cannot reach protected creation routes', async () => {
  const response = await request('/api/pets/report', { token: 'not-a-valid-token' })
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: 'Invalid or expired token' })
})

test('authentication accepts the relevant role matrix without granting anonymous access', async () => {
  const roles = [
    ['owner', 'user'],
    ['reporter', 'user'],
    ['unrelated', 'user'],
    ['shelter_admin', 'shelter_admin'],
  ]

  for (const [label, role] of roles) {
    const id = new mongoose.Types.ObjectId()
    users.set(String(id), { _id: id, name: label, role })
    const token = jwt.sign({ id: String(id) }, TEST_SECRET, { expiresIn: '5m' })
    const response = await fetch(`${baseUrl}/role-matrix`, {
      headers: { authorization: `Bearer ${token}` },
    })
    assert.equal(response.status, 200, label)
    assert.deepEqual(await response.json(), { id: String(id), role }, label)
  }

  const guestResponse = await fetch(`${baseUrl}/role-matrix`)
  assert.equal(guestResponse.status, 401)
})
