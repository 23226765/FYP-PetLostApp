import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import ContentReport from '../models/ContentReport.js'
import UserBlock from '../models/UserBlock.js'
import User from '../models/User.js'
import safetyRouter from '../routes/safety.js'
import { resetRateLimitsForTests } from '../middleware/rateLimit.js'

const TEST_SECRET = 'Harbour!Safety-Role-Matrix-2026-Strong'
const originalSecret = process.env.JWT_SECRET
const originals = {
  userFindById: User.findById,
  userFind: User.find,
  reportExists: ContentReport.exists,
  reportUpsert: ContentReport.findOneAndUpdate,
  blockExists: UserBlock.exists,
  blockUpsert: UserBlock.findOneAndUpdate,
  blockFind: UserBlock.find,
  blockDelete: UserBlock.deleteOne,
}
const users = new Map()
const reports = new Map()
const blocks = new Map()
let server
let baseUrl

function queryFor(document) {
  return {
    select: async () => document,
    then(resolve) { return Promise.resolve(document).then(resolve) },
  }
}

before(async () => {
  process.env.JWT_SECRET = TEST_SECRET
  resetRateLimitsForTests()
  User.findById = (id) => queryFor(users.get(String(id)) || null)
  User.find = (filter) => ({
    select: async () => (filter?._id?.$in || []).map((id) => users.get(String(id))).filter(Boolean),
  })
  ContentReport.exists = async (filter) => reports.has(`${filter.reporter}:${filter.targetType}:${filter.targetId}`)
  ContentReport.findOneAndUpdate = async (filter, update) => {
    const key = `${filter.reporter}:${filter.targetType}:${filter.targetId}`
    if (!reports.has(key)) reports.set(key, { _id: new mongoose.Types.ObjectId(), ...update.$setOnInsert, status: 'pending', createdAt: new Date() })
    return reports.get(key)
  }
  UserBlock.exists = async (filter) => blocks.has(`${filter.blocker}:${filter.blocked}`)
  UserBlock.findOneAndUpdate = async (filter) => {
    const record = { _id: new mongoose.Types.ObjectId(), ...filter, createdAt: new Date() }
    blocks.set(`${filter.blocker}:${filter.blocked}`, record)
    return record
  }
  UserBlock.find = (filter) => ({
    sort() { return this },
    limit: async () => [...blocks.values()].filter((record) => String(record.blocker) === String(filter.blocker)),
  })
  UserBlock.deleteOne = async (filter) => ({ deletedCount: blocks.delete(`${filter.blocker}:${filter.blocked}`) ? 1 : 0 })

  const app = express()
  app.use(express.json())
  app.use('/api/safety', safetyRouter)
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  User.findById = originals.userFindById
  User.find = originals.userFind
  ContentReport.exists = originals.reportExists
  ContentReport.findOneAndUpdate = originals.reportUpsert
  UserBlock.exists = originals.blockExists
  UserBlock.findOneAndUpdate = originals.blockUpsert
  UserBlock.find = originals.blockFind
  UserBlock.deleteOne = originals.blockDelete
  if (originalSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalSecret
  if (server) await new Promise((resolve) => server.close(resolve))
})

function tokenFor(id) { return jwt.sign({ id: String(id) }, TEST_SECRET, { expiresIn: '5m' }) }
async function api(path, { token, method = 'GET', body } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
}

test('guest cannot report, block, list blocks, or unblock', async () => {
  const targetId = new mongoose.Types.ObjectId()
  const scenarios = [
    ['/api/safety/reports', 'POST', { targetType: 'user', targetId: String(targetId), reason: 'spam' }],
    [`/api/safety/blocks/${targetId}`, 'PUT'],
    ['/api/safety/blocks', 'GET'],
    [`/api/safety/blocks/${targetId}`, 'DELETE'],
  ]
  for (const [path, method, body] of scenarios) {
    const response = await api(path, { method, body })
    assert.equal(response.status, 401, `${method} ${path}`)
  }
})

test('owner, reporter, unrelated user, and shelter admin share the same authenticated safety permissions', async () => {
  const targetId = new mongoose.Types.ObjectId()
  users.set(String(targetId), { _id: targetId, name: 'Report target', avatar: '', email: 'private@example.test', phone: '+852 5000 0000' })
  const roles = [
    ['owner', 'user'],
    ['reporter', 'user'],
    ['unrelated', 'user'],
    ['shelter_admin', 'shelter_admin'],
  ]

  for (const [label, role] of roles) {
    const id = new mongoose.Types.ObjectId()
    users.set(String(id), { _id: id, name: label, role })
    const token = tokenFor(id)
    const reportResponse = await api('/api/safety/reports', {
      token,
      method: 'POST',
      body: { targetType: 'user', targetId: String(targetId), reason: 'spam', details: `${label} evidence` },
    })
    assert.equal(reportResponse.status, 201, label)
    const reportBody = await reportResponse.json()
    const serialized = JSON.stringify(reportBody)
    for (const prohibited of ['targetOwner', 'reporter', 'details', 'email', 'phone']) {
      assert.equal(serialized.includes(`"${prohibited}"`), false, `${label}: ${prohibited}`)
    }

    const blockResponse = await api(`/api/safety/blocks/${targetId}`, { token, method: 'PUT' })
    assert.equal(blockResponse.status, 201, label)
    const listResponse = await api('/api/safety/blocks', { token })
    assert.equal(listResponse.status, 200, label)
    const list = await listResponse.json()
    assert.deepEqual(list.users.map((user) => user.id), [String(targetId)], label)
    assert.equal(JSON.stringify(list).includes('private@example.test'), false, label)

    const unblockResponse = await api(`/api/safety/blocks/${targetId}`, { token, method: 'DELETE' })
    assert.equal(unblockResponse.status, 200, label)
  }
})

test('account-scoped block listing never exposes another account block', async () => {
  const firstId = new mongoose.Types.ObjectId()
  const secondId = new mongoose.Types.ObjectId()
  const targetId = new mongoose.Types.ObjectId()
  users.set(String(firstId), { _id: firstId, name: 'First', role: 'user' })
  users.set(String(secondId), { _id: secondId, name: 'Second', role: 'user' })
  users.set(String(targetId), { _id: targetId, name: 'Target', role: 'user', avatar: '' })
  await api(`/api/safety/blocks/${targetId}`, { token: tokenFor(firstId), method: 'PUT' })
  const secondList = await api('/api/safety/blocks', { token: tokenFor(secondId) })
  assert.equal(secondList.status, 200)
  assert.deepEqual(await secondList.json(), { users: [] })
  await api(`/api/safety/blocks/${targetId}`, { token: tokenFor(firstId), method: 'DELETE' })
})
