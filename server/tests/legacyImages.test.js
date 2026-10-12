import test, { before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import express from 'express'
import jwt from 'jsonwebtoken'
import sharp from 'sharp'
import User from '../models/User.js'
import { authorizeMediaDestination } from '../services/mediaAccess.js'
import { normalizeLegacyPath } from '../services/legacyImageAccess.js'
import { createLegacyImagesRouter } from '../routes/legacyImages.js'
import { createUploadsRouter } from '../routes/uploads.js'
import { errorHandler } from '../middleware/errorHandler.js'

// Real Express/JWT, real permission policy, real temporary image/filesystem.
// MongoDB references and blocking are isolated mocks; no Atlas/provider writes.
const secret = 'Isolated!Legacy-Image-Authorization-Fixture-2026'
const owner = { _id: 'a'.repeat(24), role: 'user' }, reporter = { _id: 'b'.repeat(24), role: 'user' }
const unrelated = { _id: 'c'.repeat(24), role: 'user' }, admin = { _id: 'd'.repeat(24), role: 'shelter_admin' }
const petId = 'e'.repeat(24), sightingId = 'f'.repeat(24), messageId = '1'.repeat(24), strayId = '2'.repeat(24)
const actors = new Map([owner, reporter, unrelated, admin].map((actor) => [actor._id, actor]))
const rows = { user: [], pet: [], sighting: [], stray: [], message: [] }
let root, directory, server, origin, raster, modelReads = 0, blocked = false
const originalFindById = User.findById, originalSecret = process.env.JWT_SECRET

function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some((part) => matches(row, part))
    const actual = row[key]
    if (value instanceof RegExp) return (Array.isArray(actual) ? actual : [actual]).some((item) => typeof item === 'string' && value.test(item))
    if (value?.$ne !== undefined) return actual !== value.$ne
    return String(actual) === String(value)
  })
}
function query(getter) {
  let limit = Infinity
  return { select() { return this }, limit(value) { limit = value; return this }, lean() { return this }, session() { return this },
    then(resolve, reject) { return Promise.resolve().then(getter).then((value) => Array.isArray(value) ? value.slice(0, limit) : value).then(resolve, reject) } }
}
const models = Object.fromEntries(Object.keys(rows).map((type) => [type, {
  find: (filter) => query(() => { modelReads++; return rows[type].filter((row) => matches(row, filter)) }),
  findOne: (filter) => query(() => rows[type].find((row) => matches(row, filter)) || null),
}]))
const dependencies = { models, authorize: (type, id, user, options) => authorizeMediaDestination(type, id, user, { ...options, blocks: async () => blocked }) }
const pet = (photo, overrides = {}) => ({ _id: petId, reportedBy: owner._id, photo, ...overrides })
const sighting = (photo, overrides = {}) => ({ _id: sightingId, reportedBy: reporter._id, pet: petId, photo, ...overrides })

async function request(urlPath, actor, extra = {}, method = 'GET') {
  return fetch(origin + urlPath, { method, headers: { ...(actor ? { authorization: `Bearer ${jwt.sign({ id: actor._id }, secret)}` } : {}), ...extra } })
}
async function unavailable(urlPath, actor) {
  const response = await request(urlPath, actor)
  assert.equal(response.status, 404)
  assert.match(response.headers.get('cache-control'), /private, no-store/)
  assert.equal(response.headers.get('etag'), null)
  const payload = await response.json()
  assert.equal(payload.code, 'IMAGE_NOT_FOUND')
  assert.ok(!JSON.stringify(payload).includes(root))
}
before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'petlostapp-legacy-image-test-'))
  root = path.join(directory, 'uploads'); await fs.mkdir(root)
  raster = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#1d6360' } }).webp().toBuffer()
  for (const file of ['public.webp', 'private.webp', 'shared.webp', 'message.webp', 'unreferenced.webp']) await fs.writeFile(path.join(root, file), raster)
  await fs.mkdir(path.join(root, 'nested')); await fs.writeFile(path.join(root, 'nested', 'public.webp'), raster)
  await fs.writeFile(path.join(root, 'disguised.webp'), '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
  process.env.JWT_SECRET = secret
  User.findById = async (id) => actors.get(String(id)) || null
  const app = express()
  app.use('/uploads', createLegacyImagesRouter({ root, ...dependencies }))
  app.use('/api/uploads', createUploadsRouter({ legacyImages: { root, ...dependencies } }))
  app.use(errorHandler)
  server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
})
beforeEach(() => { for (const type of Object.keys(rows)) rows[type] = []; blocked = false; modelReads = 0 })
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  User.findById = originalFindById
  if (originalSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalSecret
  // Only this mkdtemp-created fixture tree, never application uploads.
  if (directory && directory.startsWith(path.join(os.tmpdir(), 'petlostapp-legacy-image-test-'))) await fs.rm(directory, { recursive: true, force: true })
})

test('visible pet/rescue/avatar photos remain discoverable through old URLs and authenticated API aliases', async () => {
  for (const type of ['pet', 'stray', 'user']) {
    beforeReset()
    rows[type] = [type === 'user' ? { _id: owner._id, avatar: '/uploads/public.webp' } : { _id: type === 'pet' ? petId : strayId, reportedBy: owner._id, photo: '/uploads/public.webp', active: true }]
    for (const actor of [undefined, owner, reporter, unrelated, admin]) {
      for (const prefix of ['/uploads', '/api/uploads/legacy']) {
        const response = await request(`${prefix}/public.webp`, actor)
        assert.equal(response.status, 200)
        assert.equal(response.headers.get('content-type'), 'image/webp')
        assert.deepEqual(Buffer.from(await response.arrayBuffer()), raster)
      }
    }
  }
})
function beforeReset() { for (const type of Object.keys(rows)) rows[type] = [] }

test('sighting photos allow only the relevant owner/reporter; no general shelter-admin bypass', async () => {
  rows.pet = [pet('')]; rows.sighting = [sighting('/uploads/private.webp')]
  for (const actor of [owner, reporter]) assert.equal((await request('/uploads/private.webp', actor)).status, 200)
  for (const actor of [undefined, unrelated, admin]) await unavailable('/uploads/private.webp', actor)
})

test('hidden/inactive records and hidden parents deny every ordinary role', async () => {
  for (const type of ['pet', 'sighting', 'stray', 'message']) {
    beforeReset(); rows.pet = [pet('')]
    if (type === 'pet') rows.pet = [pet('/uploads/private.webp', { moderationStatus: 'hidden' })]
    if (type === 'sighting') rows.sighting = [sighting('/uploads/private.webp', { moderationStatus: 'hidden' })]
    if (type === 'stray') rows.stray = [{ _id: strayId, reportedBy: reporter._id, photo: '/uploads/private.webp', active: false }]
    if (type === 'message') { rows.message = [{ _id: messageId, pet: petId, participant: reporter._id, sentBy: reporter._id, photo: '/uploads/private.webp' }]; rows.pet[0].moderationStatus = 'hidden' }
    for (const actor of [undefined, owner, reporter, unrelated, admin]) await unavailable('/uploads/private.webp', actor)
  }
  beforeReset(); rows.pet = [pet('', { moderationStatus: 'hidden' })]; rows.sighting = [sighting('/uploads/private.webp')]
  await unavailable('/uploads/private.webp', owner)
})

test('chat photos require membership and an unblocked owner/participant relationship', async () => {
  rows.pet = [pet('')]; rows.message = [{ _id: messageId, pet: petId, participant: reporter._id, sentBy: reporter._id, photo: '/uploads/message.webp' }]
  for (const actor of [owner, reporter]) assert.equal((await request('/uploads/message.webp', actor)).status, 200)
  for (const actor of [undefined, unrelated, admin]) await unavailable('/uploads/message.webp', actor)
  blocked = true
  for (const actor of [owner, reporter]) await unavailable('/uploads/message.webp', actor)
  // Emergency discovery intentionally remains public despite a blocked relationship.
  rows.pet[0].photo = '/uploads/public.webp'
  assert.equal((await request('/uploads/public.webp', reporter)).status, 200)
})

test('unreferenced files, orphan private records, ambiguous absolute-only references and disguised SVG are unavailable', async () => {
  await unavailable('/uploads/unreferenced.webp', owner)
  rows.sighting = [sighting('/uploads/private.webp')]
  await unavailable('/uploads/private.webp', reporter)
  rows.pet = [pet('https://unknown-server.example/uploads/public.webp')]
  await unavailable('/uploads/public.webp', owner)
  rows.pet = [pet('/uploads/disguised.webp')]
  await unavailable('/uploads/disguised.webp', owner)
})

test('all references must authorize: public photos arrays/avatar copies cannot bypass private or hidden references', async () => {
  rows.pet = [pet('/uploads/public.webp', { photos: ['/uploads/shared.webp'] })]
  rows.user = [{ _id: unrelated._id, avatar: '/uploads/shared.webp' }]
  rows.sighting = [sighting('/uploads/%73hared.webp')]
  for (const actor of [undefined, unrelated, admin]) await unavailable('/uploads/shared.webp', actor)
  for (const actor of [owner, reporter]) assert.equal((await request('/uploads/shared.webp', actor)).status, 200)
  rows.sighting[0].moderationStatus = 'hidden'
  for (const actor of [owner, reporter]) await unavailable('/uploads/shared.webp', actor)
})

test('unknown-origin private copies restrict public references and malformed aliases fail closed', async () => {
  rows.pet = [pet('/uploads/shared.webp')]
  rows.sighting = [sighting('https://unknown-server.example/uploads/shared.webp')]
  await unavailable('/uploads/shared.webp', unrelated)
  rows.sighting[0].photo = '/uploads/nested/../shared.webp'
  await unavailable('/uploads/shared.webp', owner)
  for (const alias of ['/uploads/shared.webp.', '/uploads/shared.webp::$DATA']) {
    rows.sighting[0].photo = alias
    await unavailable('/uploads/shared.webp', owner)
  }
})

test('encoded filenames, loopback absolute URLs and nested paths resolve consistently', async () => {
  rows.pet = [pet('http://localhost:5001/uploads/%70ublic.webp')]
  assert.equal((await request('/uploads/%70ublic.webp')).status, 200)
  rows.pet = [pet('/uploads/nested/public.webp')]
  assert.equal((await request('/api/uploads/legacy/nested/public.webp')).status, 200)
  await unavailable('/uploads/public.webp', owner)
})

test('GET/HEAD ignore old cache validators and use private no-store without ETags', async () => {
  rows.pet = [pet('/uploads/public.webp')]
  for (const method of ['GET', 'HEAD']) {
    const response = await request('/uploads/public.webp', owner, { 'if-none-match': '*', 'if-modified-since': new Date().toUTCString() }, method)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('cache-control'), /private, no-store/)
    assert.match(response.headers.get('vary'), /Authorization/)
    assert.equal(response.headers.get('etag'), null)
    assert.equal(response.headers.get('last-modified'), null)
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    if (method === 'HEAD') assert.equal(await response.text(), '')
  }
})

test('traversal, encoded traversal, separators, NUL, drive paths and token queries are rejected', async () => {
  const bad = ['/../private.webp', '/%2e%2e/private.webp', '/%252e%252e/private.webp', '/nested%2fprivate.webp', '/nested%5cprivate.webp', '/%00private.webp', '//private.webp', '/C:%5cprivate.webp', '/private.webp.', '/private.webp::$DATA', '/private.webp?token=not-a-credential']
  for (const relative of bad) {
    assert.throws(() => normalizeLegacyPath(relative), { code: 'IMAGE_NOT_FOUND' })
    // node:http preserves traversal instead of fetch/browser URL normalization.
    const status = await new Promise((resolve, reject) => {
      const req = http.get({ hostname: '127.0.0.1', port: new URL(origin).port, path: '/uploads' + relative }, (res) => { res.resume(); resolve(res.statusCode) })
      req.on('error', reject)
    })
    assert.equal(status, 404)
  }
  assert.equal(modelReads, 0, 'Malicious paths must fail before ownership queries')
})

test('excessive reference ambiguity fails closed instead of truncating away a private owner', async () => {
  rows.pet = Array.from({ length: 101 }, (_value, index) => pet('/uploads/public.webp', { _id: index.toString(16).padStart(24, '0') }))
  await unavailable('/uploads/public.webp', owner)
})

test('directory symlink/junction escapes are rejected without reading the external image', async (t) => {
  const outside = path.join(directory, 'outside'); await fs.mkdir(outside); await fs.writeFile(path.join(outside, 'secret.webp'), raster)
  try { await fs.symlink(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir') }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('OS does not permit isolated symlink fixture'); return } throw error }
  rows.pet = [pet('/uploads/escape/secret.webp')]
  await unavailable('/uploads/escape/secret.webp', owner)
})

test('hard-link aliases are rejected rather than bypassing another path policy', async () => {
  await fs.link(path.join(root, 'private.webp'), path.join(root, 'linked.webp'))
  rows.pet = [pet('/uploads/linked.webp')]
  await unavailable('/uploads/linked.webp', owner)
})
