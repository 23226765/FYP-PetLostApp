import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdtemp, writeFile, readFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import mongoose from 'mongoose'
import express from 'express'
import jwt from 'jsonwebtoken'
import sharp from 'sharp'
import User from '../models/User.js'
import { createModerationEvidenceResolver } from '../services/moderationEvidence.js'
import { createModerationEvidenceController } from '../controllers/moderationEvidenceController.js'
import { createModerationRouter } from '../routes/moderation.js'
import { createManagedUploadController } from '../controllers/managedUploadController.js'
import { attachedImageForViewer, authorizeMediaDestination } from '../services/mediaAccess.js'
import { readLegacyImage } from '../services/legacyImageAccess.js'
import { optionalAuth } from '../middleware/auth.js'
import { errorHandler } from '../middleware/errorHandler.js'

const id = () => String(new mongoose.Types.ObjectId())
const matches = (row, filter) => Object.entries(filter).every(([key, value]) => {
  if (key === '$or') return value.some((part) => matches(row, part))
  const actual = key.split('.').reduce((current, part) => current?.[part], row)
  if (value instanceof RegExp) return (Array.isArray(actual) ? actual : [actual]).some((item) => typeof item === 'string' && value.test(item))
  if (value?.$ne) return String(actual) !== String(value.$ne)
  return String(actual) === String(value)
})
const query = (get) => ({ select() { return this }, limit() { return this }, lean: async () => structuredClone(get()),
  then(resolve, reject) { return Promise.resolve().then(get).then(resolve, reject) } })
function fixture() {
  const owner = { _id: id(), role: 'user' }, reporter = { _id: id(), role: 'user' }, unrelated = { _id: id(), role: 'user' }, admin = { _id: id(), role: 'shelter_admin' }
  const tables = Object.fromEntries(['pet', 'sighting', 'stray', 'message', 'user'].map((type) => [type, new Map()]))
  const models = Object.fromEntries(Object.entries(tables).map(([type, table]) => [type, {
    findById: (key) => query(() => table.get(String(key)) || null),
    findOne: (filter) => query(() => [...table.values()].find((row) => matches(row, filter)) || null),
    find: (filter) => query(() => [...table.values()].filter((row) => matches(row, filter))),
  }]))
  for (const actor of [owner, reporter, unrelated, admin]) tables.user.set(actor._id, { ...actor, avatar: '' })
  const parent = { _id: id(), reportedBy: owner._id, moderationStatus: 'hidden', photo: '' }; tables.pet.set(parent._id, parent)
  const reports = new Map(), assets = new Map(), entries = {}
  for (const type of ['user', 'pet', 'sighting', 'stray', 'message']) {
    const targetId = type === 'user' ? owner._id : id(), imageId = id()
    const author = ['message', 'sighting', 'stray'].includes(type) ? reporter._id : owner._id
    const target = { _id: targetId, reportedBy: author, sentBy: author, participant: reporter._id, pet: parent._id,
      moderationStatus: 'hidden', imageIds: [imageId], [type === 'user' ? 'avatar' : 'photo']: `/api/uploads/managed/${imageId}/content` }
    if (type === 'user') target.role = 'user'
    tables[type].set(targetId, target)
    const report = { _id: id(), targetType: type, targetId, reporter: type === 'message' ? owner._id : unrelated._id, targetOwner: author, status: 'pending' }
    reports.set(report._id, report)
    const asset = { _id: imageId, state: 'attached', purpose: type === 'user' ? 'avatar' : type, uploadedBy: author,
      attachedTo: { type, id: targetId }, bytes: 4, provider: 'cloudinary', publicId: 'synthetic-object' }
    assets.set(imageId, asset); entries[type] = { target, report, asset }
  }
  const Reports = { findById: (key) => query(() => reports.get(String(key)) || null) }
  const Assets = { findOne: (filter) => query(() => [...assets.values()].find((row) => matches(row, filter)) || null) }
  const resolve = createModerationEvidenceResolver({ Reports, Assets, models })
  return { owner, reporter, unrelated, admin, parent, tables, models, reports, assets, entries, Reports, Assets, resolve }
}

test('reported-context evidence supports all image types/hidden parents without changing ordinary delivery authorization', async () => {
  const f = fixture()
  for (const [type, { report, asset }] of Object.entries(f.entries)) {
    assert.equal((await f.resolve(report._id, '0', f.admin)).asset._id, asset._id)
    for (const user of [undefined, f.owner, f.reporter, f.unrelated]) await assert.rejects(f.resolve(report._id, 0, user), { status: 403 })
    if (type !== 'user') await assert.rejects(attachedImageForViewer(asset._id, f.admin, {
      Assets: f.Assets, authorize: (kind, key, user) => authorizeMediaDestination(kind, key, user, { models: f.models, blocks: async () => false }),
    }), { code: 'IMAGE_NOT_FOUND' })
  }
})
test('invalid, deleted, mismatched, unreported or retargeted evidence fails closed on every request', async () => {
  const f = fixture(), { report, asset, target } = f.entries.message
  for (const [reportId, index] of [[id(), 0], ['bad', 0], [report._id, 6], [report._id, '-1'], [report._id, asset._id]]) {
    await assert.rejects(f.resolve(reportId, index, f.admin), { code: 'IMAGE_NOT_FOUND' })
  }
  report.reporter = f.unrelated._id
  await assert.rejects(f.resolve(report._id, 0, f.admin), { code: 'IMAGE_NOT_FOUND' })
  report.reporter = f.owner._id; report.targetOwner = f.unrelated._id
  await assert.rejects(f.resolve(report._id, 0, f.admin), { code: 'IMAGE_NOT_FOUND' })
  report.targetOwner = target.sentBy; asset.attachedTo.id = id()
  await assert.rejects(f.resolve(report._id, 0, f.admin), { code: 'IMAGE_NOT_FOUND' })
  asset.attachedTo.id = target._id; target.photo = ''
  await assert.rejects(f.resolve(report._id, 0, f.admin), { code: 'IMAGE_NOT_FOUND' })
  target.photo = `/api/uploads/managed/${asset._id}/content`; report.status = 'unexpected'
  await assert.rejects(f.resolve(report._id, 0, f.admin), { code: 'IMAGE_NOT_FOUND' })
  report.status = 'reviewed'; assert.ok(await f.resolve(report._id, 0, f.admin))
  f.reports.delete(report._id)
  await assert.rejects(f.resolve(report._id, 0, f.admin), { code: 'IMAGE_NOT_FOUND' })
})
test('real HTTP/JWT role matrix revalidates role/report on repeated evidence requests; ordinary private image URLs stay forbidden', async () => {
  const f = fixture(), original = User.findById, oldSecret = process.env.JWT_SECRET
  const secret = randomBytes(48).toString('base64url'); process.env.JWT_SECRET = secret
  User.findById = (key) => f.models.user.findById(key)
  let reads = 0
  const storageFactory = () => ({ openReadStream: async () => { reads++; return new Response(Buffer.from('safe')).body } })
  const app = express()
  app.use('/api/moderation', createModerationRouter({ evidenceController: createModerationEvidenceController({ resolve: f.resolve, storageFactory }) }))
  const ordinary = createManagedUploadController({ storageFactory, attachedForViewer: (key, user) => attachedImageForViewer(key, user, {
    Assets: f.Assets, authorize: (type, targetId, viewer) => authorizeMediaDestination(type, targetId, viewer, { models: f.models, blocks: async () => false }),
  }) })
  app.get('/api/uploads/managed/:id/content', optionalAuth, ordinary.deliverManagedImage)
  app.use(errorHandler)
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const fetchAs = (route, actor) => fetch(`${base}${route}`, { headers: actor ? { authorization: `Bearer ${jwt.sign({ id: actor._id }, secret)}` } : {} })
  try {
    const route = `/api/moderation/reports/${f.entries.message.report._id}/images/0`
    assert.equal((await fetchAs(route)).status, 401)
    for (const actor of [f.owner, f.reporter, f.unrelated]) assert.equal((await fetchAs(route, actor)).status, 403)
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetchAs(route, f.admin)
      assert.equal(response.status, 200); assert.equal(await response.text(), 'safe')
      assert.match(response.headers.get('cache-control'), /private.*no-store/)
      assert.match(response.headers.get('vary'), /Authorization/); assert.equal(response.headers.get('location'), null)
    }
    assert.equal(reads, 2)
    assert.equal((await fetchAs(`/api/uploads/managed/${f.entries.message.asset._id}/content`, f.admin)).status, 404)
    f.tables.user.get(f.admin._id).role = 'user'
    assert.equal((await fetchAs(route, f.admin)).status, 403); assert.equal(reads, 2)
    f.tables.user.get(f.admin._id).role = 'shelter_admin'; f.reports.delete(f.entries.message.report._id)
    assert.equal((await fetchAs(route, f.admin)).status, 404); assert.equal(reads, 2)
    assert.equal((await fetchAs(route)).status, 401)
  } finally {
    await new Promise((resolve) => server.close(resolve)); User.findById = original
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret
  }
})
test('legacy evidence uses real protected file reads, strips metadata, preserves originals and refuses unrelated private shared references', async () => {
  const f = fixture(), entry = f.entries.pet
  const root = await mkdtemp(path.join(tmpdir(), 'petlostapp-evidence-')), filename = path.join(root, 'fixture.png')
  const buffer = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#1d6360' } }).png().toBuffer()
  await writeFile(filename, buffer)
  entry.target.photo = '/uploads/fixture.png'
  const resolve = createModerationEvidenceResolver({ Reports: f.Reports, Assets: f.Assets, models: f.models,
    legacyReader: (key, viewer, options) => readLegacyImage(key, viewer, { ...options, root }) })
  try {
    const evidence = await resolve(entry.report._id, 0, f.admin)
    assert.equal((await sharp(evidence.buffer).metadata()).format, 'webp')
    assert.deepEqual(await readFile(filename), buffer)
    f.entries.message.target.photo = '/uploads/fixture.png'
    await assert.rejects(resolve(entry.report._id, 0, f.admin), { code: 'IMAGE_NOT_FOUND' })
    f.entries.message.target.photo = ''
    entry.target.photo = '/uploads/%2e%2e/private.png'
    await assert.rejects(resolve(entry.report._id, 0, f.admin), { code: 'IMAGE_NOT_FOUND' })
  } finally { await unlink(filename); await rmdir(root) }
})
test('legacy Base64 is raster-validated; remote evidence cannot become an arbitrary URL/redirect proxy', async () => {
  const f = fixture(), entry = f.entries.pet
  const buffer = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#1d6360' } }).png().toBuffer()
  let fetches = 0
  const resolve = createModerationEvidenceResolver({ Reports: f.Reports, Assets: f.Assets, models: f.models,
    fetchImpl: async () => { fetches++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }) } })
  entry.target.photo = `data:image/png;base64,${buffer.toString('base64')}`
  assert.equal((await sharp((await resolve(entry.report._id, 0, f.admin)).buffer).metadata()).format, 'webp')
  for (const url of ['data:image/svg+xml;base64,PHN2Zz4=', 'https://127.0.0.1/private', 'https://images.unsplash.com.evil.test/photo', 'https://user:password@images.unsplash.com/photo']) {
    entry.target.photo = url; await assert.rejects(resolve(entry.report._id, 0, f.admin), { code: 'IMAGE_NOT_FOUND' })
  }
  assert.equal(fetches, 0)
  entry.target.photo = 'https://images.unsplash.com/synthetic'
  await assert.rejects(resolve(entry.report._id, 0, f.admin), { code: 'IMAGE_NOT_FOUND' }); assert.equal(fetches, 1)
})
