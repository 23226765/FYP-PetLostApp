import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import http from 'node:http'
import sharp from 'sharp'
import User from '../models/User.js'
import { createUploadsRouter } from '../routes/uploads.js'
import { createImageLifecycle } from '../services/imageLifecycle.js'
import { IMAGE_LIMITS } from '../config/imageStorage.js'
import { resetRateLimitsForTests } from '../middleware/rateLimit.js'
import { createImageUploadSlots } from '../middleware/imageUpload.js'

const secret = 'Fictional!Image-Authorization-Fixture-2026'
const previous = { secret: process.env.JWT_SECRET, enabled: process.env.IMAGE_UPLOADS_ENABLED, find: User.findById }
const users = new Map(), records = new Map()
let server, baseUrl, image, uploads = 0
const storage = {
  provider: 'cloudinary', publicIdFor: (purpose, uuid) => `petlostapp/test/${purpose}/${uuid}`,
  async uploadImage(buffer, asset) {
    uploads++
    const meta = await sharp(buffer).metadata()
    return { provider: 'cloudinary', publicId: asset.publicId, providerAssetId: 'fixture', secureUrl: 'https://res.cloudinary.com/fixture/asset.webp', width: meta.width, height: meta.height, bytes: buffer.length, format: 'webp' }
  },
  async deleteImage() {},
  async openReadStream() { return new Response(Buffer.from('safe')).body },
}
const repository = {
  assertDatabase() {}, async count() { return 0 },
  async find(filter) {
    return [...records.values()].find((r) => Object.entries(filter).every(([k, v]) => String(r[k]) === String(v))) || null
  },
  async create(values) { records.set(String(values._id), { ...values }) },
  async reserve(values) { await this.create(values) },
  async refreshLease() { return true },
  async update(id, states, values) {
    const r = records.get(String(id)); if (!r || !states.includes(r.state)) return false
    Object.assign(r, values); return true
  },
}

before(async () => {
  process.env.JWT_SECRET = secret; process.env.IMAGE_UPLOADS_ENABLED = 'true'
  User.findById = async (id) => users.get(String(id)) || null
  image = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#1d6360' } }).png().toBuffer()
  const app = express()
  app.use('/api/uploads', createUploadsRouter({ storageFactory: () => storage, lifecycleFactory: ({ storage: s }) => createImageLifecycle({ storage: s, repository }) }))
  app.use((error, _req, res, _next) => res.status(500).json({ code: error.code || 'ERROR' }))
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})
after(async () => {
  User.findById = previous.find
  for (const [name, value] of [['JWT_SECRET', previous.secret], ['IMAGE_UPLOADS_ENABLED', previous.enabled]]) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value
  }
  resetRateLimitsForTests()
  await new Promise((resolve) => server.close(resolve))
})
function account(role = 'user') {
  const user = { _id: new mongoose.Types.ObjectId(), role }
  users.set(String(user._id), user)
  return { user, token: jwt.sign({ id: String(user._id) }, secret) }
}
async function upload(token, { data = image, mime = 'image/png', filename = 'fixture.png', fields = {}, extraFile = false } = {}) {
  const body = new FormData()
  body.append('purpose', 'pet'); body.append('idempotencyKey', `fixture_${new mongoose.Types.ObjectId()}`)
  for (const [key, value] of Object.entries(fields)) body.append(key, value)
  body.append('image', new Blob([data], { type: mime }), filename)
  if (extraFile) body.append('image', new Blob([data], { type: mime }), filename)
  return fetch(`${baseUrl}/api/uploads/managed`, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body })
}

test('guests/invalid tokens are rejected before parsing or provider/database operations', async () => {
  const beforeCount = uploads
  for (const token of [undefined, 'invalid']) assert.equal((await upload(token)).status, 401)
  assert.equal(uploads, beforeCount)
})

test('owner/reporter/unrelated/admin may upload only their own pending images', async () => {
  const accounts = ['owner', 'reporter', 'unrelated', 'shelter_admin'].map((r) => account(r === 'shelter_admin' ? r : 'user'))
  const assets = []
  for (const actor of accounts) {
    const response = await upload(actor.token)
    assert.equal(response.status, 201)
    const body = await response.json()
    assert.deepEqual(Object.keys(body.image).sort(), ['bytes', 'format', 'height', 'id', 'url', 'width'])
    assets.push(body.image)
    const preview = await fetch(`${baseUrl}${body.image.url}`, { headers: { authorization: `Bearer ${actor.token}` } })
    assert.equal(preview.status, 200)
    assert.match(preview.headers.get('cache-control'), /no-store/)
    assert.equal(preview.headers.get('content-type'), 'image/webp')
    await preview.arrayBuffer()
  }
  for (const actor of accounts.slice(1)) {
    const response = await fetch(`${baseUrl}${assets[0].url}`, { headers: { authorization: `Bearer ${actor.token}` } })
    assert.equal(response.status, 404)
  }
  assert.equal((await fetch(`${baseUrl}${assets[0].url}`)).status, 401)
})

test('binary decoding rejects disguised file MIME and enforces multipart limits', async () => {
  const { token } = account(), beforeCount = uploads
  const disguised = await upload(token, { data: Buffer.from('MZ not an image'), filename: 'pet.jpg', mime: 'image/jpeg' })
  assert.equal(disguised.status, 400)
  assert.equal((await disguised.json()).code, 'IMAGE_INVALID')
  assert.equal((await upload(token, { extraFile: true })).status, 400)
  assert.equal((await upload(token, { fields: { publicId: 'arbitrary-delete-id' } })).status, 400)
  assert.equal((await upload(token, { data: Buffer.alloc(IMAGE_LIMITS.inputBytes + 1) })).status, 413)
  assert.equal(uploads, beforeCount)
  // Parser failures must release the per-user slot.
  assert.equal((await upload(token)).status, 201)
})

test('browser MIME and extension cannot veto an actual supported raster', async () => {
  const response = await upload(account().token, { filename: 'unknown.bin', mime: 'application/octet-stream' })
  assert.equal(response.status, 201)
})

test('disconnect while parsing releases the uploader slot and creates no object', async () => {
  const { token } = account(), beforeCount = uploads
  const request = http.request(`${baseUrl}/api/uploads/managed`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'multipart/form-data; boundary=fixture-abort', 'content-length': '100000' },
  })
  request.on('error', () => {})
  request.write('--fixture-abort\r\nContent-Disposition: form-data; name="image"; filename="fixture.png"\r\nContent-Type: image/png\r\n\r\n')
  await new Promise((resolve) => setTimeout(resolve, 50))
  request.destroy()
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(uploads, beforeCount)
  assert.equal((await upload(token)).status, 201)
})

test('feature disabled returns sanitized 503 and does not affect legacy route registration', async () => {
  process.env.IMAGE_UPLOADS_ENABLED = 'false'
  const beforeCount = uploads
  const response = await upload(account().token)
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, 'IMAGE_UPLOADS_DISABLED')
  assert.equal(uploads, beforeCount)
  process.env.IMAGE_UPLOADS_ENABLED = 'true'
  assert.equal((await fetch(`${baseUrl}/api/uploads/image`, { method: 'POST' })).status, 401)
})

test('slots bound concurrent parsing/processing and release explicitly after disconnect', () => {
  const gate = createImageUploadSlots()
  const requests = [0, 1, 2].map(() => ({ user: { _id: new mongoose.Types.ObjectId() } }))
  function res() { return { status(code) { this.code = code; return this }, set() {}, json(value) { this.body = value } } }
  let accepted = 0
  gate(requests[0], res(), () => accepted++)
  gate(requests[1], res(), () => accepted++)
  const rejected = res(); gate(requests[2], rejected, () => accepted++)
  assert.equal(accepted, 2); assert.equal(rejected.code, 503)
  const sameUser = res(); gate(requests[0], sameUser, () => accepted++)
  assert.equal(sameUser.code, 409)
  requests[0].releaseImageUploadSlot(); requests[0].releaseImageUploadSlot()
  gate(requests[2], res(), () => accepted++)
  assert.equal(accepted, 3)
  requests[1].releaseImageUploadSlot(); requests[2].releaseImageUploadSlot()
})
