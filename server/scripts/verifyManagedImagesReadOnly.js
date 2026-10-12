// Read-only Atlas/API harness. No production startup/collection initialization,
// Cloudinary uploads, seeds, migrations, cleanup, or application mutations.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import express from 'express'

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'), quiet: true })
process.env.ALLOW_TEST_SEED = 'false'
process.env.ALLOW_IMAGE_MIGRATION = 'false'
process.env.ALLOW_IMAGE_CLEANUP = 'false'
mongoose.set('autoCreate', false)
mongoose.set('autoIndex', false)
let server, writes = 0, stage = 'JWT configuration'
const privateFields = new Set(['password', 'passwordHash', 'token', 'refreshToken', 'jwtSecret', 'JWT_SECRET', 'MONGODB_URI', 'CLOUDINARY_API_SECRET', 'publicId', 'providerAssetId', 'secureUrl', 'apiKey', 'apiSecret', 'imageIds', 'moderationReason'])
function inspect(value, guest = false) {
  if (!value || typeof value !== 'object') return
  for (const [key, item] of Object.entries(value)) {
    assert.ok(!privateFields.has(key), `Prohibited field: ${key}`)
    if (guest) {
      assert.ok(!['phone', 'ownerPhone', 'reporterPhone', 'email', 'realName'].includes(key) || !item, 'Guest received private contact data')
      if (key === 'coordinates') assert.equal(value.locationPrecision, 'approximate', 'Guest coordinates must be approximate')
    }
    inspect(item, guest)
  }
}
try {
  const { requireJwtSecret } = await import('../config/security.js')
  requireJwtSecret()
  console.log('PASS JWT configuration (secret withheld).')
  stage = 'Atlas connection'
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'petlostapp', autoIndex: false, autoCreate: false, monitorCommands: true, serverSelectionTimeoutMS: 10000 })
  assert.equal(mongoose.connection.name, 'petlostapp')
  stage = 'read-only API startup'
  mongoose.connection.getClient().on('commandStarted', (event) => {
    if (['insert', 'update', 'delete', 'findAndModify', 'create', 'createIndexes', 'drop', 'dropDatabase', 'dropIndexes'].includes(event.commandName)) writes++
  })
  const { databaseHealth } = await import('../config/database.js')
  const { configureHttpSecurity, resolveHttpSecurityConfig } = await import('../config/httpSecurity.js')
  const { errorHandler } = await import('../middleware/errorHandler.js')
  const { requireAuth } = await import('../middleware/auth.js')
  const app = express()
  configureHttpSecurity(app, resolveHttpSecurityConfig())
  app.use(express.json())
  app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || (req.method === 'POST' && req.path === '/api/auth/login')) return next()
    // The existing auth middleware proves guest rejection; even authenticated
    // mutations are denied by this harness before reaching any controller.
    return requireAuth(req, res, () => res.status(405).json({ code: 'READ_ONLY_VERIFICATION' }))
  })
  app.get('/api/health', async (_req, res) => {
    const health = await databaseHealth()
    res.status(health.connected ? 200 : 503).json({ status: health.connected ? 'ok' : 'degraded', db: health.connected ? 'connected' : 'disconnected', ...health })
  })
  for (const name of ['auth', 'pets', 'strays', 'chat', 'notifications', 'analytics', 'uploads', 'matches', 'safety', 'moderation']) {
    app.use(`/api/${name}`, (await import(`../routes/${name}.js`)).default)
  }
  app.use('/uploads', (await import('../routes/legacyImages.js')).default)
  app.use(errorHandler)
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api`
  const get = async (route, token) => {
    const response = await fetch(`${base}${route}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(10000) })
    assert.equal(response.status, 200, `GET ${route} failed`)
    const body = await response.json(); inspect(body, !token); return body
  }
  const health = await get('/health')
  assert.equal(health.database, 'petlostapp'); assert.equal(health.readyState, 1)
  assert.equal(health.connected, true)
  console.log('PASS live health HTTP 200, petlostapp, readyState 1.')
  stage = 'API smoke'
  process.env.PAWRADAR_API_URL = base
  await import('../../scripts/smoke-api.mjs')
  assert.notEqual(process.exitCode, 1, 'Smoke tests failed')
  stage = 'guest privacy and authorization'
  await get('/pets?limit=5'); await get('/strays?limit=5')
  await get('/analytics/hotspots?lat=22.3&lng=114.18&radiusKm=5&days=14')
  for (const route of ['/pets/report', '/strays/report', `/pets/${'a'.repeat(24)}/sighting`, `/chat/${'a'.repeat(24)}`, '/uploads/managed']) {
    const response = await fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(5000) })
    assert.equal(response.status, 401)
  }
  console.log('PASS guest browsing/privacy and creation authentication middleware (read-only harness).')
  const { default: Pet } = await import('../models/Pet.js')
  const pet = await Pet.findOne({ seedBatch: 'fyp-demo-v1', name: 'Maple', moderationStatus: { $ne: 'hidden' } }).select('_id').lean()
  if (pet) { await get(`/pets/${pet._id}`); await get(`/pets/${pet._id}/sightings`) }
  const legacyActors = [undefined]
  for (const email of ['fyp.owner@pawradar.test', 'fyp.finder@pawradar.test', 'fyp.shelter@pawradar.test']) {
    stage = `read-only seeded login (${email})`
    if (!process.env.SEED_USER_PASSWORD) { console.log(`SKIP read-only login: ${email} (no locally configured test password).`); continue }
    const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: process.env.SEED_USER_PASSWORD }), signal: AbortSignal.timeout(10000) })
    if (response.status === 401) { console.log(`SKIP read-only role check: ${email} (configured password not accepted; no reset attempted).`); continue }
    assert.equal(response.status, 200, 'Read-only login failed')
    const { token, user } = await response.json()
    legacyActors.push({ token, user: { _id: user.id, role: user.role } })
    assert.ok(token); await get('/pets?limit=5', token); await get('/strays?limit=5', token)
    await get('/chat/inbox', token); await get('/notifications', token)
    if (pet) { await get(`/pets/${pet._id}`, token); await get(`/pets/${pet._id}/sightings`, token) }
    console.log(`PASS read-only login and browse/inbox/notifications: ${email} (${user.role}).`)
  }
  stage = 'protected legacy image delivery (read-only)'
  await (await import('./verifyLegacyImagesReadOnly.js')).verifyLegacyImagesReadOnly({ base, actors: legacyActors })
  assert.equal(writes, 0, 'Unexpected database write observed')
  console.log('PASS zero database write/index commands; no Cloudinary writes. Managed-image creation/transactions still require isolated or approved live verification.')
} catch (error) {
  const category = /^[A-Za-z0-9_]{1,50}$/.test(error?.name || '') ? error.name : 'Error'
  console.error(`Read-only verification failed at ${stage} (${category}); exception details withheld.`)
  process.exitCode = 1
} finally {
  if (server) await new Promise((resolve) => server.close(resolve))
  await mongoose.disconnect().catch(() => undefined)
}
