// Disposable local preview; never import normal startup, dotenv or real storage.
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { mock } from 'node:test'
import { createInterface } from 'node:readline'
import { registerHooks } from 'node:module'
import { createTaskTracker } from './manualPhotoSafety.js'
import { PREVIEW_PORT, PET_CENTRE, RESCUE_CENTRE, preparePreviewEnvironment, fixtureDocuments } from './localPhotoPreviewSupport.js'

const args = process.argv.slice(2)
if (!args.includes('--local-only') || args.some(arg => !['--local-only', '--verify-and-stop'].includes(arg))) {
  console.error('No action taken. Use --local-only; optionally --verify-and-stop.')
  process.exit(1)
}
preparePreviewEnvironment(process.env)
process.env.JWT_SECRET = randomBytes(48).toString('base64url')
const run = randomUUID().replaceAll('-', ''), database = `fyp_transactions_preview_${run}`
const origin = `http://127.0.0.1:${PREVIEW_PORT}`
const directory = new URL(`../../verification/local-photo-preview/${run}/`, import.meta.url)
const ledger = { run, database, isolated: true, storageAttempts: 0, blockedProviderImports: 0, externalFetchAttempts: 0, records: {}, cleanupComplete: false }
let stage = 'local-setup'
const tasks = createTaskTracker()
let mongoose, replica, backend, frontend, input, initialized = false, ready = false, stopping = false, stopPromise
let saveQueue = Promise.resolve()
function save() {
  const contents = JSON.stringify(ledger, null, 2)
  saveQueue = saveQueue.then(() => writeFile(new URL('ledger.json', directory), contents))
  return saveQueue
}
function assertLocal() {
  assert.ok(initialized && mongoose.connection.readyState === 1)
  assert.equal(mongoose.connection.name, database)
  assert.equal(mongoose.connection.host, '127.0.0.1')
}
const nativeFetch = globalThis.fetch
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') {
    ledger.externalFetchAttempts++; throw new Error('External preview requests are disabled')
  }
  return nativeFetch(input, options)
}
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'cloudinary' || /\/storage\/cloudinaryStorage\.js$/.test(specifier)) {
    ledger.blockedProviderImports++; throw new Error('Provider imports are disabled in this local preview')
  }
  return next(specifier, context)
} })
function trackRouter(router) {
  for (const layer of router.stack || []) {
    if (layer.route) for (const route of layer.route.stack) {
      const original = route.handle
      if (original.length !== 4) route.handle = function (req, res, next) { void tasks.run(() => original.call(this, req, res, next)).catch(next) }
    }
    else if (layer.handle?.stack) trackRouter(layer.handle)
  }
  return router
}
async function stop() {
  if (stopPromise) return stopPromise
  stopping = true
  stopPromise = (async () => {
    input?.close()
    await frontend?.close()
    if (backend) { const closed = new Promise(resolve => backend.close(resolve)); backend.closeAllConnections(); await closed }
    await tasks.drain()
    if (initialized && mongoose.connection.readyState === 1) {
      assertLocal()
      // Only this process's new empty-at-start database, and exact enumerated IDs.
      for (const collection of await mongoose.connection.db.listCollections().toArray()) {
        const table = mongoose.connection.db.collection(collection.name)
        const ids = (await table.find({}, { projection: { _id: 1 } }).toArray()).map(row => row._id)
        ledger.records[collection.name] = ids.map(String)
        await save()
        if (ids.length) await table.deleteMany({ _id: { $in: ids } })
        assert.equal(await table.countDocuments({}), 0)
      }
    }
    await mongoose?.disconnect(); await replica?.stop()
    ledger.cleanupComplete = true; ledger.serversStopped = true; ledger.replicaStopped = Boolean(replica)
    await save(); hooks.deregister(); globalThis.fetch = nativeFetch
    console.log(JSON.stringify({ stopped: true, cleanupComplete: true, database, storageAttempts: ledger.storageAttempts, externalFetchAttempts: ledger.externalFetchAttempts }))
    process.stdin.pause()
  })()
  return stopPromise
}
function requestedStop() { stopping = true; if (ready) void stop().catch(() => { process.exitCode = 1 }) }
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, requestedStop)

try {
  await mkdir(directory, { recursive: true }); await save()
  for (const animal of ['dog', 'cat']) assert.ok((await readFile(new URL(`../../public/test-photos/${animal}.jpg`, import.meta.url))).length > 0)
  mock.module(new URL('../config/database.js', import.meta.url).href, { namedExports: { DATABASE_NAME: database } })
  mock.module(new URL('../services/storage/index.js', import.meta.url).href, { namedExports: {
    createImageStorage() { ledger.storageAttempts++; throw new Error('Uploads/provider storage disabled in local preview') },
  } })
  ;({ default: mongoose } = await import('mongoose'))
  const { MongoMemoryReplSet } = await import('mongodb-memory-server-core')
  const { validateLocalTransactionUri } = await import('../tests/helpers/localTransactions.js')
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.17', checkMD5: true }, replSet: { name: `fyp_transactions_${run}`, count: 1, ip: '127.0.0.1', storageEngine: 'wiredTiger' } })
  const uri = replica.getUri(`fyp_transactions_${run}`)
  validateLocalTransactionUri(uri)
  await mongoose.connect(uri, { dbName: database, autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000 })
  initialized = true; assertLocal()
  const hello = await mongoose.connection.db.admin().command({ hello: 1 })
  assert.equal(hello.setName, `fyp_transactions_${run}`); assert.equal(hello.hosts.length, 1)
  assert.equal(new URL(`mongodb://${hello.hosts[0]}`).hostname, '127.0.0.1')
  assert.equal((await mongoose.connection.db.listCollections().toArray()).length, 0)
  for (const file of await readdir(new URL('../models/', import.meta.url))) if (file.endsWith('.js')) await import(`../models/${file}`)
  for (const model of Object.values(mongoose.models)) { await model.createCollection(); await model.createIndexes() }
  const password = 'Local-Preview-Only-2026!'
  const { default: bcrypt } = await import('bcryptjs')
  const passwordHash = await bcrypt.hash(password, 10)
  const seedBatch = `local-photo-preview-${run}`
  const creator = await mongoose.models.User.create({ name: 'Fictional Preview Creator', email: 'preview.creator@example.test', password: passwordHash, seedBatch })
  await mongoose.models.User.create({ name: 'Fictional Preview Viewer', email: 'preview.viewer@example.test', password: passwordHash, seedBatch })
  const docs = fixtureDocuments({ origin, run, creatorId: creator._id })
  const pets = await mongoose.models.Pet.create(docs.pets), strays = await mongoose.models.Stray.create(docs.strays)
  const viewer = await mongoose.models.User.findOne({ email: 'preview.viewer@example.test' })
  const sightings = await mongoose.models.Sighting.create([
    { pet: pets[0]._id, reportedBy: viewer._id, location: { type: 'Point', coordinates: PET_CENTRE }, locationName: 'Fictional preview east gate', note: 'Fictional preview observation with an attached licensed photo.', photo: docs.pets[0].photo, sightedAt: new Date(Date.now() - 3600000), seedBatch },
    { pet: pets[0]._id, reportedBy: creator._id, location: { type: 'Point', coordinates: [PET_CENTRE[0] + 0.001, PET_CENTRE[1]] }, locationName: 'Fictional preview square', note: '', photo: '', sightedAt: new Date(Date.now() - 1800000), seedBatch },
  ])
  await mongoose.models.StrayComment.create({ stray: strays[0]._id, author: viewer._id, text: 'Fictional preview comment. No real rescue incident.', seedBatch })
  if (stopping) throw new Error('Preview startup cancelled')
  const { default: express } = await import('express')
  const app = express(); app.use(express.json({ limit: '10mb' })); app.use(express.urlencoded({ extended: true, limit: '10mb' }))
  app.use((_req, res, next) => stopping ? res.sendStatus(503) : next())
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', database, readyState: mongoose.connection.readyState, isolated: true, uploadsEnabled: false, aiEnabled: false }))
  for (const route of ['auth', 'pets', 'strays', 'chat', 'uploads', 'notifications', 'matches', 'analytics', 'safety', 'moderation']) app.use(`/api/${route}`, trackRouter((await import(`../routes/${route}.js`)).default))
  app.use((await import('../middleware/errorHandler.js')).errorHandler)
  backend = app.listen(0, '127.0.0.1'); await new Promise((resolve, reject) => { backend.once('listening', resolve); backend.once('error', reject) })
  const api = `http://127.0.0.1:${backend.address().port}/api`
  const { createServer } = await import('vite'); const { default: vue } = await import('@vitejs/plugin-vue')
  frontend = await createServer({ configFile: false, envDir: false, root: fileURLToPath(new URL('../../', import.meta.url)), plugins: [vue()],
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api') },
    server: { host: '127.0.0.1', port: PREVIEW_PORT, strictPort: true,
      headers: { 'Permissions-Policy': 'geolocation=()', 'Content-Security-Policy': `default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.tile.openstreetmap.org; connect-src 'self' ws://127.0.0.1:${PREVIEW_PORT}; object-src 'none'; base-uri 'self'` },
      proxy: { '/api': { target: api.slice(0, -4) } }, watch: { ignored: ['**/verification/**', '**/android/**'] },
    } })
  await frontend.listen()
  const request = async (path, options) => {
    stage = `verify:${path.split('?')[0]}`
    const response = await fetch(api + path, options)
    if (response.status !== 200) ledger.httpFailure = { path: path.split('?')[0], status: response.status }
    assert.equal(response.status, 200, path); return response.json()
  }
  const health = await request('/health'); assert.equal(health.database, database); assert.equal(health.readyState, 1)
  const login = await request('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'preview.viewer@example.test', password }) })
  const auth = { headers: { authorization: `Bearer ${login.token}` } }
  const disabledUpload = await fetch(api + '/uploads/managed', { method: 'POST', headers: auth.headers })
  assert.equal(disabledUpload.status, 503)
  const radar = await request(`/pets/nearby?lng=${PET_CENTRE[0]}&lat=${PET_CENTRE[1]}&radiusKm=3`, auth)
  assert.deepEqual(new Set(radar.pets.map(pet => pet.id)), new Set(pets.map(pet => String(pet._id))))
  const rescue = await request(`/strays/nearby?lng=${RESCUE_CENTRE[0]}&lat=${RESCUE_CENTRE[1]}&radiusKm=1`, auth)
  const rescueItems = rescue.strays || rescue
  assert.deepEqual(new Set(rescueItems.map(stray => stray.id)), new Set(strays.map(stray => String(stray._id))))
  const map = await request('/pets/map?west=113.82&south=22.15&east=114.5&north=22.57&page=1&limit=100', auth)
  assert.equal(map.markers.length, 2); assert.equal(map.insights.total, 2)
  assert.deepEqual(map.insights.speciesCounts, { dog: 1, cat: 1, other: 0 })
  assert.ok(map.markers.every(marker => marker.locationPrecision === 'approximate'))
  for (const [route, records, key] of [['pets', pets, 'pet'], ['strays', strays, 'stray']]) for (const record of records) {
    const detail = await request(`/${route}/${record._id}`, auth)
    assert.equal(detail[key].photo, record.photo); assert.deepEqual(detail[key].photos, record.photos)
  }
  const guestSightings = await request(`/pets/${pets[0]._id}/sightings`)
  assert.equal(guestSightings.sightings.length, 2)
  assert.ok(guestSightings.sightings.every(sighting => !sighting.note && !sighting.photo && sighting.locationPrecision === 'approximate'))
  const viewerSightings = await request(`/pets/${pets[0]._id}/sightings`, auth)
  assert.equal(viewerSightings.sightings.find(sighting => sighting.id === String(sightings[0]._id)).photo, docs.pets[0].photo)
  for (const animal of ['dog', 'cat']) {
    const response = await fetch(`${origin}/test-photos/${animal}.jpg`)
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /image\/jpeg/)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await readFile(new URL(`../../public/test-photos/${animal}.jpg`, import.meta.url)))
  }
  assert.equal(ledger.storageAttempts, 0); assert.equal(ledger.blockedProviderImports, 0); assert.equal(ledger.externalFetchAttempts, 0)
  ledger.verified = { health: true, viewerRadar: 2, viewerRescue: 2, mapReports: 2, detailPhotos: 4, localJpegs: 2, privateSightingProjection: true, uploadsDisabled: true, providerCalls: 0 }
  ledger.fixtures = { pets: pets.map(pet => ({ id: String(pet._id), name: pet.name })), strays: strays.map(stray => ({ id: String(stray._id), species: stray.species })) }
  await save()
  await writeFile(new URL('README.md', directory), `# Disposable fictional photo preview\n\nOpen ${origin}; choose Continue as guest. Or use viewer login preview.viewer@example.test / ${password}. Creator login uses preview.creator@example.test / the same disposable password.\n\nRadar: two fictional pets near Wan Chai. Rescue: two fictional posts near Yau Tsim Mong. Click any card to open its existing detail view. Viewer login can see its permitted dog sighting photo/note. These public local photos are not evidence of protected binary delivery.\n\nUploads/AI are disabled; no runtime .env, Atlas or Cloudinary is used. Device geolocation is disabled in this preview so app fallback locations are predictable; OSM tiles still require internet. Stock images are explicitly attached in fixture records, never fallbacks.\n\nType stop or press Ctrl+C in the owning terminal for exact fixture removal and server/replica shutdown.\n`)
  if (stopping) throw new Error('Preview startup cancelled')
  ready = true
  console.log(JSON.stringify({ ready: true, url: origin, database, isolated: true, verified: ledger.verified, instructions: fileURLToPath(new URL('README.md', directory)) }))
  if (args.includes('--verify-and-stop')) await stop()
  else {
    input = createInterface({ input: process.stdin })
    input.on('line', command => { if (command.trim() === 'stop') void stop().catch(() => { process.exitCode = 1 }) })
    input.once('close', () => { if (!stopping) void stop().catch(() => { process.exitCode = 1 }) })
  }
} catch (error) {
  ledger.failed = true; ledger.failureName = error?.name === 'AssertionError' ? 'AssertionError' : 'PreviewStartupError'
  ledger.failedStage = stage
  console.error('Local preview could not start; no provider or runtime credentials are used. Check the local ledger and ensure port 4182 and the cached MongoDB binary are available.')
  process.exitCode = 1
  try { await stop() } catch { console.error('Local preview teardown incomplete; preserve its ledger.'); process.exitCode = 1 }
}
