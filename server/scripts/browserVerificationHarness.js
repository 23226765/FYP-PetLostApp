// Disposable browser verification only. No runtime environment files or real providers.
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import mongoose from 'mongoose'
import express from 'express'
import sharp from 'sharp'
import { MongoMemoryReplSet } from 'mongodb-memory-server-core'

for (const key of Object.keys(process.env)) {
  if (/MONGO|CLOUDINARY|SECRET|PASSWORD|TOKEN|DOTENV|^VITE_|^MEDIA_|^NODE_OPTIONS$|^DEBUG$/i.test(key)) delete process.env[key]
}
Object.assign(process.env, { NODE_ENV: 'test', ALLOW_TEST_SEED: 'false', IMAGE_UPLOADS_ENABLED: 'true', JWT_SECRET: randomBytes(48).toString('base64url') })
const run = randomUUID().replaceAll('-', '')
const database = `fyp_transactions_browser_${run}`
const root = fileURLToPath(new URL('../../', import.meta.url))
const verificationDate = process.env.BROWSER_VERIFY_DATE || '2026-10-23'
assert.match(verificationDate, /^\d{4}-\d{2}-\d{2}$/)
const directory = new URL(`../../verification/browser-integration-${verificationDate}/${run}/`, import.meta.url)
await mkdir(directory, { recursive: true })
const ledger = { run, database, provider: 'in-memory mock', records: {}, objects: [], requests: [], providerEvents: [], cleanupComplete: false }
let writes = Promise.resolve()
const save = () => { const contents = JSON.stringify(ledger, null, 2); writes = writes.then(() => writeFile(new URL('ledger.json', directory), contents)); return writes }
await save()
const objects = new Map()
let failUploads = 0, uploadDelay = 0
const storage = {
  provider: 'cloudinary',
  publicIdFor: (purpose, uuid) => `petlostapp/test/${run}/${purpose}/${uuid}`,
  async uploadImage(buffer, asset) {
    assert.ok(asset.publicId.startsWith(`petlostapp/test/${run}/`))
    ledger.providerEvents.push({ event: 'upload-start', at: new Date().toISOString(), assetId: String(asset._id), key: asset.idempotencyKey }); await save()
    if (uploadDelay) await new Promise(resolve => setTimeout(resolve, uploadDelay))
    if (failUploads) { failUploads--; ledger.providerEvents.push({ event: 'upload-failed', at: new Date().toISOString(), assetId: String(asset._id) }); await save(); throw Object.assign(new Error('Synthetic provider outage'), { code: 'IMAGE_STORAGE_UNAVAILABLE' }) }
    assert.ok(!objects.has(asset.publicId))
    const info = await sharp(buffer).metadata()
    const metadata = { provider: 'cloudinary', publicId: asset.publicId, providerAssetId: randomUUID(), secureUrl: `https://res.cloudinary.com/fictional/image/authenticated/${run}/${asset._id}.webp`, width: info.width, height: info.height, format: info.format, bytes: buffer.length }
    objects.set(asset.publicId, { buffer: Buffer.from(buffer), metadata })
    ledger.objects.push({ publicId: asset.publicId, assetId: String(asset._id) }); await save()
    ledger.providerEvents.push({ event: 'upload-finished', at: new Date().toISOString(), assetId: String(asset._id) }); await save()
    return metadata
  },
  async stat(asset) { return objects.get(asset.publicId)?.metadata || null },
  async deleteImage(asset) { assert.ok(asset.publicId.startsWith(`petlostapp/test/${run}/`)); objects.delete(asset.publicId); return { deleted: true } },
  async openReadStream(asset) { const entry = objects.get(asset.publicId); assert.ok(entry); return Readable.toWeb(Readable.from([entry.buffer])) },
}
mock.module(new URL('../config/database.js', import.meta.url).href, { namedExports: { DATABASE_NAME: database } })
mock.module(new URL('../services/storage/index.js', import.meta.url).href, { namedExports: { createImageStorage: () => storage } })
let replica, backend, frontend, stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await frontend?.close()
  if (backend) { backend.closeAllConnections(); await new Promise(resolve => backend.close(resolve)) }
  if (mongoose.connection.readyState === 1) {
    assert.equal(mongoose.connection.name, database)
    for (const collection of await mongoose.connection.db.listCollections().toArray()) {
      const table = mongoose.connection.db.collection(collection.name)
      const rows = await table.find({}, { projection: { _id: 1 } }).toArray()
      ledger.records[collection.name] = rows.map(row => String(row._id))
      await save()
      if (rows.length) await table.deleteMany({ _id: { $in: rows.map(row => row._id) } })
      assert.equal(await table.countDocuments({}), 0)
    }
    await mongoose.disconnect()
  }
  for (const entry of ledger.objects) { await storage.deleteImage(entry); assert.equal(await storage.stat(entry), null); entry.absentConfirmed = true }
  await replica?.stop()
  ledger.cleanupComplete = true; await save()
  console.log('CLEANUP_VERIFIED: exact local IDs removed; mock objects absent; owned replica stopped.')
  process.stdin.pause()
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void stop().catch(() => { process.exitCode = 1 }) })
try {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.17' }, replSet: { name: `fyp_transactions_${run}`, count: 1, ip: '127.0.0.1', storageEngine: 'wiredTiger' } })
  const uri = replica.getUri(database)
  assert.equal(new URL(uri).hostname, '127.0.0.1')
  mongoose.set('autoCreate', false); mongoose.set('autoIndex', false)
  await mongoose.connect(uri, { dbName: database, autoCreate: false, autoIndex: false })
  assert.equal(mongoose.connection.name, database)
  assert.equal((await mongoose.connection.db.admin().command({ hello: 1 })).setName, `fyp_transactions_${run}`)
  assert.equal((await mongoose.connection.db.listCollections().toArray()).length, 0)
  for (const file of await readdir(new URL('../models/', import.meta.url))) if (file.endsWith('.js')) await import(`../models/${file}`)
  for (const Model of Object.values(mongoose.models)) { await Model.createCollection(); await Model.createIndexes() }
  const app = express()
  const { configureHttpSecurity, resolveHttpSecurityConfig } = await import('../config/httpSecurity.js')
  configureHttpSecurity(app, resolveHttpSecurityConfig({ NODE_ENV: 'test', CORS_ORIGINS: 'http://127.0.0.1:4179,http://localhost:4179' }))
  app.use(express.json({ limit: '10mb' })); app.use(express.urlencoded({ extended: true, limit: '10mb' }))
  app.use((req, res, next) => { const requestPath = req.originalUrl.split('?')[0], startedAt = new Date().toISOString(); res.once('finish', () => { ledger.requests.push({ method: req.method, path: requestPath, status: res.statusCode, startedAt, finishedAt: new Date().toISOString(), ...(req.body?.idempotencyKey ? { imageKey: req.body.idempotencyKey } : {}), ...(req.body?.submissionId ? { submissionId: req.body.submissionId } : {}) }); void save() }); next() })
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', database, readyState: mongoose.connection.readyState, isolated: true }))
  for (const route of ['auth', 'pets', 'strays', 'chat', 'uploads', 'notifications', 'matches', 'analytics', 'safety', 'moderation']) app.use(`/api/${route}`, (await import(`../routes/${route}.js`)).default)
  app.use('/uploads', (await import('../routes/legacyImages.js')).default)
  app.use((await import('../middleware/errorHandler.js')).errorHandler)
  backend = app.listen(0, '127.0.0.1'); await new Promise(resolve => backend.once('listening', resolve))
  const base = `http://127.0.0.1:${backend.address().port}`
  // Synthetic registration uses the actual hashing/controller pathway.
  const password = 'Browser-Fixture-Only-2026!'
  for (const [name, language, theme] of [['owner', 'en', 'light'], ['reporter', 'zh-HK', 'dark'], ['shelter', 'zh-CN', 'dark']]) {
    const response = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Browser ${name}`, email: `${name}@browser.example.test`, password }) })
    assert.equal(response.status, 201)
    const result = await response.json()
    await mongoose.models.User.updateOne({ _id: result.user.id || result.user._id }, { $set: { preferences: { language, theme }, ...(name === 'shelter' ? { role: 'shelter_admin' } : {}) } })
  }
  for (const [name, color] of [['teal', '#1d6360'], ['coral', '#ef6351']]) await sharp({ create: { width: 160, height: 120, channels: 3, background: color } }).png().toFile(fileURLToPath(new URL(`${name}.png`, directory)))
  const { createServer } = await import('vite')
  const { default: vue } = await import('@vitejs/plugin-vue')
  const retainedFormPath = '/__verification/retained-upload.html'
  const retainedFormHtml = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Retained upload verification</title></head><body>
    <aside><strong>Verification only: retained production report component</strong><p id="fixture-account"></p><p>Component mounts: <span id="mount-count">0</span></p></aside><div id="retained-form"></div>
    <script type="module">
      import { createApp, h } from 'vue';
      import PostPetScreen from '/src/components/PostPetScreen.vue';
      import { i18n } from '/src/i18n/index.ts';
      import { getProfile } from '/src/services/api.ts';
      import { captureAuthContext, isAuthContextCurrent } from '/src/services/authSession.ts';
      import { applyAccountPreferences } from '/src/composables/usePreferences.ts';
      import '/src/style.css';
      const context = captureAuthContext();
      try {
        const initialUser = await getProfile();
        if (!isAuthContextCurrent(context)) throw new Error('Session changed during fixture initialization');
        applyAccountPreferences(initialUser.preferences);
        document.getElementById('fixture-account').textContent = 'Initial synthetic account: ' + initialUser.name;
        let mounts = 0;
        createApp({ render: () => h(PostPetScreen, { user: initialUser, onVnodeMounted: () => { document.getElementById('mount-count').textContent = String(++mounts); } }) }).use(i18n).mount('#retained-form');
        // Deliberately no host storage listener, keyed remount or field reset.
        // Actual production component/session/upload handlers own invalidation.
      } catch { document.getElementById('fixture-account').textContent = 'Sign in through the normal isolated app before opening this fixture.'; }
    </script></body></html>`
  const retainedFormPlugin = { name: 'isolated-retained-upload-fixture', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url?.split('?')[0] !== retainedFormPath) return next()
      try { const html = await server.transformIndexHtml(retainedFormPath, retainedFormHtml); res.setHeader('Content-Type', 'text/html'); res.setHeader('Cache-Control', 'no-store'); res.end(html) }
      catch (error) { next(error) }
    })
  } }
  frontend = await createServer({ configFile: false, envDir: false, root, plugins: [vue(), retainedFormPlugin], define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api') }, server: { host: '127.0.0.1', port: 4179, strictPort: true, proxy: { '/api': { target: base }, '/uploads': { target: base } }, watch: { ignored: ['**/verification/**', '**/android/**'] } } })
  await frontend.listen()
  const health = await (await fetch(`${base}/api/health`)).json(); assert.equal(health.database, database)
  console.log(JSON.stringify({ ready: true, frontend: 'http://127.0.0.1:4179', artifacts: fileURLToPath(directory), health, accounts: ['owner@browser.example.test', 'reporter@browser.example.test', 'shelter@browser.example.test'], syntheticPassword: password }))
  process.stdin.setEncoding('utf8'); process.stdin.on('data', input => {
    const command = input.trim()
    if (command === 'stop') void stop().catch(() => { process.exitCode = 1 })
    else if (command === 'fail-next-upload') { failUploads = 1; console.log('MOCK_PROVIDER: next upload will fail once') }
    else if (/^delay-upload \d{1,5}$/.test(command)) { uploadDelay = Math.min(30000, Number(command.split(' ')[1])); console.log(`MOCK_PROVIDER: upload delay ${uploadDelay}ms`) }
    else if (command === 'snapshot') void (async () => {
      assert.equal(mongoose.connection.name, database)
      const snapshot = {
        at: new Date().toISOString(), database,
        users: await mongoose.models.User.find().select('_id name avatar').lean(),
        pets: await mongoose.models.Pet.find().select('_id name reportedBy +imageIds submissionId').lean(),
        assets: await mongoose.models.MediaAsset.find().select('_id purpose +state +uploadedBy +attachedTo +idempotencyKey +failureCode +expiresAt').lean(),
        mockObjects: [...objects.keys()],
      }
      ledger.snapshots ||= []; ledger.snapshots.push(snapshot); await save(); console.log(`SNAPSHOT_SAVED ${ledger.snapshots.length}`)
    })().catch(error => { console.error('Snapshot failed', error.name); process.exitCode = 1 })
  })
  process.stdin.once('end', () => { void stop().catch(() => { process.exitCode = 1 }) })
  process.stdin.resume()
} catch (error) {
  console.error('Isolated browser harness failed:', error.code || error.name, error.message?.replace(/mongodb[^\s]+/g, '[local URI withheld]'))
  process.exitCode = 1; await stop()
}
