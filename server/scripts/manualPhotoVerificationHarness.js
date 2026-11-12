// Opt-in manual PawRadar UI -> real local MongoDB -> one real Cloudinary upload.
// Never import application startup, load .env into process.env, or open Atlas.
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { mock } from 'node:test'
import { createInterface } from 'node:readline'
import { createSinglePhotoStorage, createTaskTracker, scrubManualEnvironment, validateFreeCapacity } from './manualPhotoSafety.js'

if (process.argv.length !== 3 || process.argv[2] !== '--confirm-one-temporary-upload') {
  console.error('No action taken: manual verification requires explicit one-upload and exact-cleanup approval.')
  process.exit(1)
}
scrubManualEnvironment(process.env)
Object.assign(process.env, { NODE_ENV: 'test', ALLOW_TEST_SEED: 'false', ALLOW_IMAGE_MIGRATION: 'false',
  ALLOW_IMAGE_CLEANUP: 'false', ALLOW_MEDIA_RECONCILIATION: 'false', IMAGE_UPLOADS_ENABLED: 'true', JWT_SECRET: randomBytes(48).toString('base64url') })

const run = randomUUID().replaceAll('-', '')
const database = `fyp_transactions_browser_${run}`
const namespace = `petlostapp/test/${run}`
const directory = new URL(`../../verification/manual-photo/${run}/`, import.meta.url)
const ledger = { run, database, namespace, provider: 'real Cloudinary', providerUploadAttempts: 0,
  objects: [], requests: [], records: {}, snapshots: [], cleanupComplete: false }
let writeQueue = Promise.resolve()
function save() {
  const contents = JSON.stringify(ledger, null, 2)
  // One serialized atomic replacement, so interruption leaves a usable old ledger.
  const operation = writeQueue.then(async () => {
    await writeFile(new URL('ledger.next.json', directory), contents, { mode: 0o600 })
    await rename(new URL('ledger.next.json', directory), new URL('ledger.json', directory))
  })
  writeQueue = operation.catch(() => {})
  return operation
}
let mongoose, replica, frontend, backend, guarded, lines, ownerId, stopPromise
let stopping = false, initialized = false, ready = false, shutdownRequested = false
let stage = 'ledger-initialization'
const handlers = createTaskTracker()
function assertLocal() {
  assert.ok(initialized && mongoose.connection.readyState === 1)
  assert.equal(mongoose.connection.name, database)
  assert.equal(mongoose.connection.host, '127.0.0.1')
}
// Express 4 does not await handlers. Track their actual promises, even if the
// client aborts and the response closes before the database/provider work ends.
function trackRouter(router) {
  for (const layer of router.stack || []) {
    if (layer.route) {
      for (const routeLayer of layer.route.stack) {
        const original = routeLayer.handle
        if (original.length === 4) continue
        routeLayer.handle = function (req, res, next) {
          void handlers.run(() => original.call(this, req, res, next)).catch(next)
        }
      }
    } else if (layer.handle?.stack) trackRouter(layer.handle)
  }
  return router
}
async function snapshot() {
  assertLocal()
  const state = { at: new Date().toISOString(), database,
    providerUploadAttempts: ledger.providerUploadAttempts,
    providerReadStarts: ledger.providerReadStarts || 0,
    users: await mongoose.models.User.find().select('_id name').lean(),
    pets: await mongoose.models.Pet.find().select('_id name reportedBy +imageIds submissionId').lean(),
    assets: await mongoose.models.MediaAsset.find().select('_id purpose +state +uploadedBy +attachedTo +idempotencyKey +failureCode +expiresAt').lean(),
    requests: ledger.requests.slice(-40),
    objects: ledger.objects.map(({ assetId, uploadStarted, uploadedAt, bytes, deleteSource, absentConfirmed, ambiguous, collision, recoveryRequired }) =>
      ({ assetId, uploadStarted, uploadedAt, bytes, deleteSource, absentConfirmed, ambiguous, collision, recoveryRequired })),
  }
  ledger.snapshots.push(state)
  await save()
  return state
}
async function stop() {
  if (stopPromise) return stopPromise
  stopping = true
  stopPromise = (async () => {
    let clean = true
    guarded?.close()
    lines?.close()
    try { await frontend?.close() } catch { clean = false }
    if (backend) {
      const closed = new Promise(resolve => backend.close(resolve))
      backend.closeAllConnections()
      await closed
    }
    await handlers.drain()
    await guarded?.drain()
    if (initialized && mongoose.connection.readyState === 1) {
      try { await snapshot() } catch { clean = false }
    }
    try { if (guarded && !await guarded.cleanup()) clean = false } catch { clean = false }
    if (initialized && mongoose.connection.readyState === 1) {
      try {
        assertLocal()
        for (const collection of await mongoose.connection.db.listCollections().toArray()) {
          const table = mongoose.connection.db.collection(collection.name)
          const ids = (await table.find({}, { projection: { _id: 1 } }).toArray()).map(row => row._id)
          ledger.records[collection.name] = ids.map(String)
          await save()
          if (ids.length) await table.deleteMany({ _id: { $in: ids } })
          assert.equal(await table.countDocuments({}), 0)
        }
        ledger.localFixturesRemoved = true
      } catch { clean = false }
    }
    try { await mongoose?.disconnect() } catch { clean = false }
    try { await replica?.stop(); ledger.replicaStopped = Boolean(replica) } catch { clean = false }
    ledger.serversStopped = true
    ledger.cleanupComplete = clean && ledger.objects.every(entry => entry.noUploadAttempted || entry.absentConfirmed)
    try { await save() } catch { clean = false; ledger.cleanupComplete = false }
    if (!clean || !ledger.cleanupComplete) process.exitCode = 1
    console.log(JSON.stringify({ stopped: true, cleanupComplete: ledger.cleanupComplete,
      providerUploadAttempts: ledger.providerUploadAttempts, providerAbsentConfirmed: ledger.objects.filter(entry => entry.absentConfirmed).length,
      recoveryRequired: ledger.objects.some(entry => entry.recoveryRequired || entry.ambiguous), ledger: fileURLToPath(new URL('ledger.json', directory)) }))
    process.stdin.pause()
  })()
  return stopPromise
}
function requestStop() {
  shutdownRequested = true
  if (ready) void stop().catch(() => { process.exitCode = 1 })
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, requestStop)

try {
  await mkdir(directory, { recursive: true })
  await save()
  stage = 'local-credentials'
  // Imports happen only AFTER inherited provider/URI/proxy settings are scrubbed.
  const { default: dotenv } = await import('dotenv')
  const { imageStorageConfig } = await import('../config/imageStorage.js')
  const local = dotenv.parse(await readFile(new URL('../.env', import.meta.url)))
  const credentials = Object.fromEntries(['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].map(key => [key, local[key]]))
  for (const key of Object.keys(local)) delete local[key]
  const config = imageStorageConfig({ ...credentials, MEDIA_NAMESPACE: 'petlostapp/test' })
  const { v2: cloudinary } = await import('cloudinary')
  stage = 'provider-capacity'
  const usage = await cloudinary.api.usage({ cloud_name: config.cloudName, api_key: config.apiKey, api_secret: config.apiSecret, secure: true, timeout: 30000 })
  ledger.capacity = validateFreeCapacity(usage)
  await save()
  if (shutdownRequested) throw new Error('Stopped')
  const { createCloudinaryStorage } = await import('../services/storage/cloudinaryStorage.js')
  guarded = createSinglePhotoStorage({ storage: createCloudinaryStorage({ ...config, namespace }), namespace, ledger, save, assertLocal, ownerId: () => ownerId })
  mock.module(new URL('../config/database.js', import.meta.url).href, { namedExports: { DATABASE_NAME: database } })
  mock.module(new URL('../services/storage/index.js', import.meta.url).href, { namedExports: { createImageStorage: () => guarded.storage } })
  stage = 'local-database-dependencies'
  ;({ default: mongoose } = await import('mongoose'))
  const { MongoMemoryReplSet } = await import('mongodb-memory-server-core')
  const { validateLocalTransactionUri } = await import('../tests/helpers/localTransactions.js')
  stage = 'local-replica-start'
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.17', checkMD5: true },
    replSet: { name: `fyp_transactions_${run}`, count: 1, ip: '127.0.0.1', storageEngine: 'wiredTiger' } })
  const uri = replica.getUri(`fyp_transactions_${run}`)
  validateLocalTransactionUri(uri)
  stage = 'local-database-connect'
  await mongoose.connect(uri, { dbName: database, autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000 })
  const hello = await mongoose.connection.db.admin().command({ hello: 1 })
  assert.equal(hello.setName, `fyp_transactions_${run}`)
  assert.equal(hello.hosts.length, 1)
  assert.equal(new URL(`mongodb://${hello.hosts[0]}`).hostname, '127.0.0.1')
  initialized = true
  assertLocal()
  assert.equal((await mongoose.connection.db.listCollections().toArray()).length, 0)
  stage = 'local-model-initialization'
  for (const file of await readdir(new URL('../models/', import.meta.url))) if (file.endsWith('.js')) await import(`../models/${file}`)
  for (const Model of Object.values(mongoose.models)) { await Model.createCollection(); await Model.createIndexes() }
  if (shutdownRequested) throw new Error('Stopped')
  stage = 'api-initialization'
  const { default: express } = await import('express')
  const app = express()
  const { configureHttpSecurity, resolveHttpSecurityConfig } = await import('../config/httpSecurity.js')
  configureHttpSecurity(app, resolveHttpSecurityConfig({ NODE_ENV: 'test', CORS_ORIGINS: 'http://127.0.0.1:4181' }))
  app.use(express.json({ limit: '10mb' })); app.use(express.urlencoded({ extended: true, limit: '10mb' }))
  app.use((req, res, next) => {
    if (stopping) return res.status(503).json({ error: 'Verification is stopping.' })
    const startedAt = new Date().toISOString()
    res.once('finish', () => {
      ledger.requests.push({ method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode,
        startedAt, finishedAt: new Date().toISOString(), ...(req.body?.idempotencyKey ? { imageKey: req.body.idempotencyKey } : {}),
        ...(req.body?.submissionId ? { submissionId: req.body.submissionId } : {}) })
      void save().catch(requestStop)
    })
    next()
  })
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', database, readyState: mongoose.connection.readyState, isolated: true, manual: true }))
  app.get('/__verification/status', (req, res) => {
    // Loopback bind plus reject browser cross-origin reads. No provider lookup.
    if (req.headers.origin && req.headers.origin !== 'http://127.0.0.1:4181') return res.sendStatus(403)
    void handlers.run(async () => res.json(await snapshot())).catch(() => res.sendStatus(503))
  })
  for (const route of ['auth', 'pets', 'strays', 'chat', 'uploads', 'notifications', 'matches', 'analytics', 'safety', 'moderation']) {
    app.use(`/api/${route}`, trackRouter((await import(`../routes/${route}.js`)).default))
  }
  app.use('/uploads', trackRouter((await import('../routes/legacyImages.js')).default))
  app.use((await import('../middleware/errorHandler.js')).errorHandler)
  backend = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => { backend.once('listening', resolve); backend.once('error', reject) })
  const base = `http://127.0.0.1:${backend.address().port}`
  stage = 'synthetic-registration'
  const email = `manual.${run}@example.test`, password = 'Manual-Fixture-Only-2026!'
  const registration = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Manual Photo Owner', email, password }) })
  assert.equal(registration.status, 201)
  const registered = await registration.json()
  ownerId = String(registered.user.id || registered.user._id)
  await mongoose.models.User.updateOne({ _id: ownerId }, { $set: { alertsEnabled: false, preferences: { language: 'en', theme: 'light' } } })
  ledger.fixtureOwner = ownerId
  await save()
  stage = 'frontend-start'
  const { createServer } = await import('vite')
  const { default: vue } = await import('@vitejs/plugin-vue')
  frontend = await createServer({ configFile: false, envDir: false, root: fileURLToPath(new URL('../../', import.meta.url)), plugins: [vue()],
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api') },
    server: { host: '127.0.0.1', port: 4181, strictPort: true,
      proxy: { '/api': { target: base }, '/uploads': { target: base }, '/__verification': { target: base } },
      watch: { ignored: ['**/verification/**', '**/android/**'] } } })
  await frontend.listen()
  if (shutdownRequested) throw new Error('Stopped')
  stage = 'instruction-file'
  await writeFile(new URL('README.md', directory), `# Manual photo verification\n\nOpen http://127.0.0.1:4181/login\n\nSynthetic login: ${email}\nPassword: ${password}\n\nUpload exactly one dog or cat test photo through the normal lost-pet report UI, submit, view it, and remove it through the UI. Do not retry another upload after an error.\n\nThe provider adapter permits one pet-image upload attempt total. No report or upload is created by this harness.\n\nRead-only status: http://127.0.0.1:4181/__verification/status\nTerminal commands: snapshot, stop. Stop performs exact approved cleanup; teardown deletion is recorded separately from application deletion.\n`, { mode: 0o600 })
  if (shutdownRequested) throw new Error('Stopped')
  ready = true
  stage = 'manual-ready'
  console.log(JSON.stringify({ ready: true, frontend: 'http://127.0.0.1:4181', database, capacity: ledger.capacity,
    instructions: fileURLToPath(new URL('README.md', directory)), ledger: fileURLToPath(new URL('ledger.json', directory)) }))
  lines = createInterface({ input: process.stdin })
  lines.on('line', command => {
    if (command.trim() === 'stop') void stop().catch(() => { process.exitCode = 1 })
    else if (command.trim() === 'snapshot') void handlers.run(async () => {
      const state = await snapshot()
      console.log(JSON.stringify({ snapshotSaved: true, providerUploadAttempts: state.providerUploadAttempts, pets: state.pets.length, assets: state.assets.length }))
    }).catch(() => { console.error('Snapshot unavailable; details withheld.') })
  })
  lines.once('close', () => { if (!stopping) void stop().catch(() => { process.exitCode = 1 }) })
} catch (error) {
  // Never serialize provider/driver messages, URLs, request configs or stacks.
  // Unknown names/codes become a fixed label, keeping diagnostics allowlisted.
  const allowedCodes = new Set(['ENOENT', 'EACCES', 'EPERM', 'ENOSPC', 'EADDRINUSE', 'ECONNREFUSED', 'ETIMEDOUT',
    'ERR_ASSERTION', 'ERR_MODULE_NOT_FOUND', 'IMAGE_STORAGE_CONFIG_INVALID', 'IMAGE_STORAGE_UNAVAILABLE'])
  const allowedNames = new Set(['DownloadError', 'Md5CheckFailedError', 'KnownVersionIncompatibilityError',
    'StartBinaryFailedError', 'InstanceInfoError', 'MongoServerSelectionError', 'MongoNetworkError'])
  const code = shutdownRequested ? 'SHUTDOWN_REQUESTED' : allowedCodes.has(error?.code) ? error.code
    : allowedNames.has(error?.name) ? error.name : 'HARNESS_FAILURE'
  ledger.failure = { stage, code }
  try { await save() } catch { /* Stop still attempts cleanup and preserves any earlier ledger. */ }
  console.error(`Manual photo harness failed at ${stage} (${code}); sensitive details withheld.`)
  process.exitCode = 1
  await stop()
}
