// Explicitly approved, isolated real HTTP + MongoDB + Cloudinary verification.
// No application startup, Atlas connection, seeds, migrations or cleanup scans.
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { readFile, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import mongoose from 'mongoose'
import express from 'express'
import dotenv from 'dotenv'
import sharp from 'sharp'
import { validateLocalTransactionUri } from '../tests/helpers/localTransactions.js'
import { imageStorageConfig } from '../config/imageStorage.js'
import { createCloudinaryStorage } from '../services/storage/cloudinaryStorage.js'
import { processImage } from '../services/imageProcessing.js'

const runId = process.env.MEDIA_E2E_RUN_ID
if (!process.argv.includes('--confirm-isolated-cloudinary-writes') || !/^[a-f0-9]{32}$/.test(runId || '')) {
  console.error('No action taken: use the approved isolated replica-set harness.')
  process.exit(1)
}
validateLocalTransactionUri(process.env.MEDIA_TEST_MONGODB_URI)
assert.equal(process.env.ALLOW_TEST_SEED, 'false')
delete process.env.MONGODB_URI
process.env.JWT_SECRET = randomBytes(48).toString('base64url')
process.env.IMAGE_UPLOADS_ENABLED = 'true'
const database = `fyp_transactions_e2e_${runId}`
const namespace = `petlostapp/test/${runId}`
const directory = await mkdtemp(path.join(tmpdir(), 'petlostapp-image-e2e-'))
const ledgerPath = path.join(directory, 'ledger.json')
const ledger = { runId, database, namespace, objects: [], fixtures: {}, results: [], cleanupComplete: false }
async function saveLedger() { await writeFile(ledgerPath, JSON.stringify(ledger, null, 2), { mode: 0o600 }) }
await saveLedger()
console.log(`Cleanup ledger: ${ledgerPath}`)
let storage, server, base, models, failedSave, stopping = false, phase = 'initialization'
let shutdownRequested = false
const ownedRecords = new Map()
const patches = []
function record(Model, id) {
  if (!ownedRecords.has(Model)) ownedRecords.set(Model, new Set())
  ownedRecords.get(Model).add(String(id))
}
const privateFields = new Set(['publicId', 'secureUrl', 'providerAssetId', 'apiKey', 'apiSecret', 'CLOUDINARY_API_SECRET', 'CLOUDINARY_API_KEY', 'JWT_SECRET', 'token', 'refreshToken', 'password', 'imageIds', 'uploadedBy', 'moderationReason'])
function safePayload(value) {
  if (typeof value === 'string') assert.ok(!/res\.cloudinary\.com|s--[\w-]+--/.test(value), 'Provider delivery URLs must stay server-only')
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!privateFields.has(key), 'Private provider/user metadata must not appear in API responses')
    safePayload(child)
  }
}
async function request(route, actor, body, method = 'GET') {
  assert.ok(!shutdownRequested, 'Verification interrupted')
  const response = await fetch(`${base}/api${route}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(60000),
    headers: { ...(actor ? { authorization: `Bearer ${actor.token}` } : {}),
      ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}),
  })
  if (response.headers.get('content-type')?.includes('application/json') && route !== '/auth/register') safePayload(await response.clone().json())
  return response
}
async function json(response, expected) {
  assert.equal(response.status, expected, 'Unexpected HTTP status')
  return response.json()
}
async function checkImage(id, actor, expected, checksum) {
  const response = await request(`/uploads/managed/${id}/content`, actor)
  assert.equal(response.status, expected, 'Image delivery authorization/status mismatch')
  if (expected === 200) {
    assert.match(response.headers.get('cache-control'), /private.*no-store/)
    assert.equal(response.headers.get('content-type'), 'image/webp')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(response.headers.get('location'), null)
    const bytes = Buffer.from(await response.arrayBuffer())
    assert.equal(createHash('sha256').update(bytes).digest('hex'), checksum, 'Delivered bytes must match processed fixture exactly')
    const metadata = await sharp(bytes).metadata()
    assert.equal(metadata.format, 'webp'); assert.equal(metadata.exif, undefined)
  } else await response.arrayBuffer()
}
async function entryFor(id) {
  const entry = ledger.objects.find((item) => item.assetId === String(id))
  assert.ok(entry, 'Only exact objects from this run may be accessed')
  assert.ok(entry.publicId.startsWith(`${namespace}/`))
  return entry
}
async function absent(id) {
  const entry = await entryFor(id)
  assert.equal(await storage.stat(entry), null, 'Exact provider deletion must be confirmed by lookup')
  entry.absentConfirmed = true
  await saveLedger()
}
async function upload(purpose, actor, source, key) {
  const form = new FormData()
  form.append('purpose', purpose); form.append('idempotencyKey', key)
  form.append('image', new Blob([source], { type: 'image/png' }), 'synthetic.png')
  return request('/uploads/managed', actor, form, 'POST')
}
async function visibility(Model, id, hidden) {
  const filter = { _id: id }
  assert.ok(ownedRecords.get(Model)?.has(String(id)), 'Visibility writes are limited to exact synthetic fixtures')
  await Model.updateOne(filter, { $set: { moderationStatus: hidden ? 'hidden' : 'visible' } })
}
async function cleanup() {
  if (stopping) return
  stopping = true
  let clean = true
  if (server) {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
  // Exact reservation IDs are persisted BEFORE each upload; no provider prefix
  // listing/deletion, public client IDs, or abandoned-upload scans are used.
  for (const entry of ledger.objects) {
    try {
      assert.ok(entry.publicId.startsWith(`${namespace}/`) && entry.provider === 'cloudinary')
      if (entry.collision) { clean = false; continue }
      if (!entry.absentConfirmed) {
        const found = await storage.stat(entry)
        if (found && entry.providerAssetId) assert.equal(found.providerAssetId, entry.providerAssetId)
        if (found) await storage.deleteImage(entry)
        assert.equal(await storage.stat(entry), null)
        entry.absentConfirmed = true
      }
    } catch { entry.cleanupFailed = true; clean = false }
    await saveLedger()
  }
  if (mongoose.connection.readyState === 1) {
    assert.equal(mongoose.connection.name, database)
    // Capture secondary effects (notifications) only under exact run-owned
    // actors/content; retain IDs in the ledger before deleting any fixture.
    if (models) {
      const userIds = [...(ownedRecords.get(models.User) || [])]
      if (userIds.length) {
        const notifications = await models.Notification.find({ user: { $in: userIds } }).select('_id').lean()
        notifications.forEach((item) => record(models.Notification, item._id))
        const budgets = await models.MediaUploadBudget.find({ user: { $in: userIds } }).select('_id').lean()
        budgets.forEach((item) => record(models.MediaUploadBudget, item._id))
      }
      for (const [Model, ids] of ownedRecords) {
        try {
          ledger.fixtures[Model.collection.name] = [...ids]
          await saveLedger()
          await Model.deleteMany({ _id: { $in: [...ids] } })
          assert.equal(await Model.countDocuments({ _id: { $in: [...ids] } }), 0)
          ledger.fixtureCleanup ||= {}
          ledger.fixtureCleanup[Model.collection.name] = 'verified-empty'
          await saveLedger()
        } catch { clean = false }
      }
    }
    await mongoose.disconnect()
  }
  patches.reverse().forEach((patch) => patch.mock.restore())
  ledger.cleanupComplete = clean && ledger.objects.every((entry) => entry.absentConfirmed)
  await saveLedger()
  console.log(`Cleanup: provider ${ledger.objects.filter((entry) => entry.absentConfirmed).length}/${ledger.objects.length} exact objects confirmed absent; isolated fixture cleanup ${ledger.cleanupComplete ? 'passed' : 'INCOMPLETE'}.`)
  if (!ledger.cleanupComplete) process.exitCode = 1
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { shutdownRequested = true })

try {
  phase = 'local credentials and test-only configuration'
  // Parse locally, but pick ONLY provider credentials; never load the Atlas URI,
  // runtime JWT secret, seed password or application environment into this run.
  const local = dotenv.parse(await readFile(new URL('../.env', import.meta.url)))
  const credentials = Object.fromEntries(['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].map((key) => [key, local[key]]))
  const config = imageStorageConfig({ ...credentials, MEDIA_NAMESPACE: 'petlostapp/test' })
  storage = createCloudinaryStorage({ ...config, namespace })
  const trackedStorage = Object.freeze({ ...storage,
    async uploadImage(buffer, asset) {
      assert.ok(ledger.objects.length < 10, 'Bounded verification permits at most ten provider objects')
      const entry = { assetId: String(asset._id), provider: 'cloudinary', publicId: asset.publicId, purpose: asset.purpose, attempted: true }
      record(models.MediaAsset, asset._id)
      ledger.objects.push(entry); await saveLedger()
      try {
        const metadata = await storage.uploadImage(buffer, asset)
        entry.providerAssetId = metadata.providerAssetId; entry.bytes = metadata.bytes
        await saveLedger(); return metadata
      } catch (error) {
        if (error.code === 'IMAGE_STORAGE_CONFLICT') entry.collision = true
        await saveLedger(); throw error
      }
    },
    async deleteImage(asset) {
      const entry = await entryFor(asset._id || ledger.objects.find((entry) => entry.publicId === asset.publicId)?.assetId)
      assert.equal(asset.publicId, entry.publicId)
      if (asset.providerAssetId && entry.providerAssetId) assert.equal(asset.providerAssetId, entry.providerAssetId)
      return storage.deleteImage(asset)
    },
  })
  // Inject ONLY configuration in this opt-in test process. All production
  // routes/controllers/models/transactions and Cloudinary methods remain real.
  mock.module(new URL('../config/database.js', import.meta.url).href, { namedExports: { DATABASE_NAME: database } })
  mock.module(new URL('../services/storage/index.js', import.meta.url).href, { namedExports: { createImageStorage: () => trackedStorage } })
  mongoose.set('autoCreate', false); mongoose.set('autoIndex', false)
  const names = ['User', 'Pet', 'Sighting', 'Stray', 'Message', 'MediaAsset', 'MediaUploadBudget', 'Notification', 'UserBlock', 'SavedStray', 'StrayComment']
  models = Object.fromEntries(await Promise.all(names.map(async (name) => [name, (await import(`../models/${name}.js`)).default])))
  phase = 'isolated database connection'
  await mongoose.connect(process.env.MEDIA_TEST_MONGODB_URI, { dbName: database, autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000 })
  const hello = await mongoose.connection.db.admin().command({ hello: 1 })
  assert.equal(hello.setName, `fyp_transactions_${runId}`)
  assert.deepEqual(hello.hosts.length, 1)
  assert.equal(mongoose.connection.name, database)
  for (const Model of Object.values(models)) { await Model.createCollection(); await Model.createIndexes() }
  for (const Model of [models.User, models.Pet, models.Sighting, models.Stray, models.Message]) {
    const save = Model.prototype.save
    patches.push(mock.method(Model.prototype, 'save', async function (options) {
      const result = await save.call(this, options)
      if (failedSave === String(this._id)) {
        failedSave = null
        assert.ok(options?.session?.inTransaction())
        throw Object.assign(new Error('Synthetic failure after actual database write'), { code: 'FIXTURE_WRITE_FAILURE' })
      }
      return result
    }))
  }
  const app = express(); app.use(express.json({ limit: '1mb' }))
  for (const name of ['auth', 'pets', 'strays', 'chat', 'uploads']) app.use(`/api/${name}`, (await import(`../routes/${name}.js`)).default)
  app.use((await import('../middleware/errorHandler.js')).errorHandler)
  server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  console.log(`Real API + database: ${database}; provider namespace: ${namespace}`)
  phase = 'synthetic account registration'
  const actors = []
  for (const role of ['owner', 'reporter', 'unrelated', 'admin']) {
    const result = await json(await request('/auth/register', undefined, {
      name: `Synthetic ${role}`, email: `${role}.${runId}@example.test`, password: randomBytes(24).toString('base64url'), phone: '+85250000101',
    }, 'POST'), 201)
    const actor = { id: result.user.id || result.user._id, token: result.token }
    safePayload(result.user)
    assert.ok(actor.id && actor.token)
    record(models.User, actor.id)
    await models.User.updateOne({ _id: actor.id }, { $set: { alertsEnabled: false, ...(role === 'admin' ? { role: 'shelter_admin' } : {}) } })
    actors.push(actor)
  }
  const [owner, reporter, unrelated, admin] = actors
  const colors = ['#1d6360', '#ef6351']
  const sources = await Promise.all(colors.map((background) => sharp({ create: { width: 48, height: 32, channels: 3, background } }).png().toBuffer()))
  let petId
  const definitions = [
    { purpose: 'avatar', type: 'user', Model: models.User, actor: owner },
    { purpose: 'pet', type: 'pet', Model: models.Pet, actor: owner },
    { purpose: 'sighting', type: 'sighting', Model: models.Sighting, actor: reporter },
    { purpose: 'stray', type: 'stray', Model: models.Stray, actor: reporter },
    { purpose: 'message', type: 'message', Model: models.Message, actor: reporter },
  ]
  const categoryRecords = []
  for (const definition of definitions) {
    const { purpose, type, Model, actor } = definition
    phase = `${purpose}: multipart upload and upload retry`
    const key = `e2e_${runId}_${purpose}_first`
    assert.equal((await upload(purpose, undefined, sources[0], key)).status, 401)
    const result = await json(await upload(purpose, actor, sources[0], key), 201)
    const first = result.image.id
    const duplicate = await json(await upload(purpose, actor, sources[0], key), 200)
    assert.equal(duplicate.image.id, first); assert.equal(duplicate.duplicate, true)
    const processed = await processImage(sources[0], purpose)
    const firstEntry = await entryFor(first), provider = await storage.stat(firstEntry)
    assert.equal(provider.providerAssetId, firstEntry.providerAssetId)
    assert.equal(provider.bytes, processed.bytes)
    assert.equal(ledger.objects.filter((entry) => entry.purpose === purpose).length, 1)
    const preview = await request(`/uploads/managed/${first}/preview`, actor)
    assert.equal(preview.status, 200)
    assert.equal(createHash('sha256').update(Buffer.from(await preview.arrayBuffer())).digest('hex'), processed.checksum)
    assert.equal((await request(`/uploads/managed/${first}/preview`, unrelated)).status, 404)
    assert.equal((await request(`/uploads/managed/${first}/preview`)).status, 401)
    phase = `${purpose}: actual content write and duplicate retry`
    let route, body, method = 'POST', field
    const submissionId = `e2e_${runId}_${purpose}`
    if (purpose === 'avatar') { route = '/auth/me'; body = { avatarImageId: first }; method = 'PATCH'; field = 'user' }
    if (purpose === 'pet') {
      route = '/pets/report'; field = 'pet'
      body = { name: 'Synthetic image verification pet', species: 'Dog', district: 'Sha Tin', locationName: 'Synthetic test location', coordinates: [114.18, 22.3], imageIds: [first], submissionId }
    }
    if (purpose === 'sighting') {
      route = `/pets/${petId}/sighting`; field = 'sighting'
      body = { location: { type: 'Point', coordinates: [114.181, 22.301] }, locationName: 'Synthetic sighting location', note: 'Synthetic private sighting note', imageIds: [first], submissionId }
    }
    if (purpose === 'stray') {
      route = '/strays/report'; field = 'stray'
      body = { species: 'Cat', description: 'Synthetic rescue fixture', condition: 'healthy', district: 'Sha Tin', locationName: 'Synthetic rescue location', coordinates: [114.18, 22.3], imageIds: [first], submissionId }
    }
    if (purpose === 'message') {
      route = `/chat/${petId}`; field = 'message'
      body = { text: 'Synthetic chat attachment', imageIds: [first], clientRequestId: submissionId }
    }
    const saved = await json(await request(route, actor, body, method), purpose === 'avatar' ? 200 : 201)
    const id = saved[field].id || saved[field]._id
    record(Model, id)
    if (purpose === 'pet') petId = id
    const again = await json(await request(route, actor, body, method), 200)
    assert.equal(again[field].id || again[field]._id, id)
    const current = await Model.findById(id).select('+imageIds')
    assert.deepEqual(current.imageIds.map(String), [first])
    assert.equal((await models.MediaAsset.findById(first).select('+state')).state, 'attached')
    phase = `${purpose}: role-matrix delivery`
    for (const viewer of [undefined, owner, reporter, unrelated, admin]) {
      const privateImage = ['sighting', 'message'].includes(purpose)
      const allowed = !privateImage || viewer === owner || viewer === reporter
      await checkImage(first, viewer, allowed ? 200 : 404, processed.checksum)
    }
    if (type !== 'user' && type !== 'message') {
      await visibility(Model, id, true)
      for (const viewer of [undefined, owner, reporter, unrelated, admin]) await checkImage(first, viewer, 404)
      await visibility(Model, id, false)
      await checkImage(first, actor, 200, processed.checksum)
    }
    phase = `${purpose}: replacement rollback and retry`
    const secondResult = await json(await upload(purpose, actor, sources[1], `e2e_${runId}_${purpose}_replacement`), 201)
    const second = secondResult.image.id
    const replacementRoute = `/uploads/managed/content/${type}/${id}`
    assert.equal((await request(replacementRoute, unrelated, { imageIds: [second] }, 'PATCH')).status, ['sighting', 'message'].includes(type) ? 404 : 403)
    failedSave = String(id)
    const failed = await request(replacementRoute, actor, { imageIds: [second] }, 'PATCH')
    assert.equal(failed.status, 503)
    assert.deepEqual((await Model.findById(id).select('+imageIds')).imageIds.map(String), [first])
    assert.equal((await models.MediaAsset.findById(second).select('+state')).state, 'pending')
    assert.ok(await storage.stat(firstEntry)); assert.ok(await storage.stat(await entryFor(second)))
    await checkImage(first, actor, 200, processed.checksum)
    await json(await request(replacementRoute, actor, { imageIds: [second] }, 'PATCH'), 200)
    await json(await request(replacementRoute, actor, { imageIds: [second] }, 'PATCH'), 200)
    assert.deepEqual((await Model.findById(id).select('+imageIds')).imageIds.map(String), [second])
    await absent(first)
    assert.equal((await models.MediaAsset.findById(first).select('+state')).state, 'deleted')
    await checkImage(first, actor, 404)
    const replacementProcessed = await processImage(sources[1], purpose)
    await checkImage(second, actor, 200, replacementProcessed.checksum)
    assert.equal(ledger.objects.filter((entry) => entry.purpose === purpose).length, 2)
    categoryRecords.push({ ...definition, id, first, second, checksum: replacementProcessed.checksum, replacementRoute })
    ledger.results.push({ purpose, uploadRetry: true, contentRetry: true, roleMatrix: true, rollback: true, replacement: true, retiredObjectAbsent: true })
    await saveLedger()
    console.log(`${purpose}: real multipart upload, save, byte-exact delivery, permissions, rollback, replacement and retries passed.`)
  }
  phase = 'parent moderation and chat blocking'
  await visibility(models.Pet, petId, true)
  for (const item of categoryRecords.filter((item) => ['pet', 'sighting', 'message'].includes(item.type))) {
    for (const viewer of actors) await checkImage(item.second, viewer, 404)
  }
  await visibility(models.Pet, petId, false)
  const chatImage = categoryRecords.find((item) => item.type === 'message')
  const block = await models.UserBlock.create({ blocker: owner.id, blocked: reporter.id })
  record(models.UserBlock, block._id)
  for (const viewer of [owner, reporter, unrelated, admin]) await checkImage(chatImage.second, viewer, 404)
  await models.UserBlock.deleteOne({ _id: block._id })
  await checkImage(chatImage.second, owner, 200, chatImage.checksum)
  phase = 'exact image removal'
  for (const item of categoryRecords) {
    if (item.type === 'stray') {
      // Product invariant: a rescue post cannot retain zero photos. Replacement
      // already removed its first object; deactivate only our synthetic post.
      assert.equal((await request(item.replacementRoute, item.actor, { imageIds: [] }, 'PATCH')).status, 400)
      assert.equal((await request(`/strays/${item.id}`, item.actor, undefined, 'DELETE')).status, 200)
      await checkImage(item.second, item.actor, 404)
      ledger.results.find((result) => result.purpose === item.purpose).lastImageRemovalRejected = true
    } else {
      await json(await request(item.replacementRoute, item.actor, { imageIds: [] }, 'PATCH'), 200)
      await json(await request(item.replacementRoute, item.actor, { imageIds: [] }, 'PATCH'), 200)
      await absent(item.second)
      await checkImage(item.second, item.actor, 404)
      assert.deepEqual((await item.Model.findById(item.id).select('+imageIds')).imageIds.map(String), [])
    }
  }
  phase = 'completed'
  console.log('All five categories passed real API/database/provider verification. Browser/UI end-to-end was not part of this harness.')
} catch (error) {
  const code = /^(IMAGE_[A-Z_]+|ERR_ASSERTION|FIXTURE_WRITE_FAILURE)$/.test(String(error?.code || '')) ? error.code : 'VERIFICATION_FAILURE'
  console.error(`Verification failed at ${phase} (${code}); provider/request details withheld.`)
  if (typeof error?.actual === 'number' && typeof error?.expected === 'number') console.error(`Numeric check: expected ${error.expected}; received ${error.actual}.`)
  ledger.failure = { phase, code }
  process.exitCode = 1
} finally { await cleanup() }
