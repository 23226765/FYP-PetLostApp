import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { commitContentImages, validateImageIds, rejectImageStrings, mediaContentUrl, contentImageReferences } from '../services/mediaAttachments.js'
import { assertMessageReplay } from '../services/submissionIdentity.js'

const id = () => String(new mongoose.Types.ObjectId())
const copy = (value) => structuredClone(value)
function fixture(purpose, type) {
  const userId = id(), assetId = id(), documents = new Map(), assets = new Map(), retired = [], events = []
  let fail = false
  assets.set(assetId, { _id: assetId, uploadedBy: userId, purpose, state: 'pending', expiresAt: new Date(Date.now() + 86400000).toISOString() })
  const matches = (row, filter) => Object.entries(filter).every(([key, value]) => {
    const actual = key.split('.').reduce((r, k) => r?.[k], row)
    if (value?.$in) return value.$in.map(String).includes(String(actual))
    if (value?.$ne !== undefined) return actual !== value.$ne
    if (value?.$gt) return new Date(actual) > new Date(value.$gt)
    return String(actual) === String(value)
  })
  const query = (read) => ({ select() { return this }, session(session) { assert.ok(session); return this }, then(resolve, reject) { return Promise.resolve().then(read).then(resolve, reject) } })
  const connection = { name: 'petlostapp', readyState: 1, async startSession() {
    return { async withTransaction(callback) {
      const beforeDocs = copy([...documents]), beforeAssets = copy([...assets])
      try { await callback(); events.push('commit') }
      catch (error) { documents.clear(); assets.clear(); beforeDocs.forEach(([k, v]) => documents.set(k, v)); beforeAssets.forEach(([k, v]) => assets.set(k, v)); events.push('rollback'); throw error }
    }, async endSession() { events.push('end') } }
  } }
  class Model {
    static db = connection
    constructor(values) { Object.assign(this, copy({ ...values, _id: String(values._id) })) }
    set(values) { Object.assign(this, copy(values)) }
    markModified(path) { assert.equal(path, 'imageIds') }
    async save({ session }) {
      assert.ok(session)
      if (fail) throw new Error('fictional write failure')
      documents.set(String(this._id), copy({ ...this })); events.push('save')
    }
    static findOne(filter) { return query(() => { const row = [...documents.values()].find((r) => matches(r, filter)); return row ? new Model(row) : null }) }
  }
  const Assets = {
    find(filter) { return query(() => [...assets.values()].filter((r) => matches(r, filter)).map(copy)) },
    async updateOne(filter, update, { session }) {
      assert.ok(session)
      const row = [...assets.values()].find((r) => matches(r, filter))
      if (!row) return { matchedCount: 0 }
      Object.assign(row, copy(update.$set)); return { matchedCount: 1 }
    },
    async updateMany(filter, update, { session }) {
      assert.ok(session)
      ;[...assets.values()].filter((r) => matches(r, filter)).forEach((row) => Object.assign(row, copy(update.$set)))
    },
  }
  const values = type === 'message' ? { sentBy: userId, text: 'Fictional test message' } : { reportedBy: userId }
  let existingId
  if (type === 'user') { existingId = userId; documents.set(userId, { _id: userId, avatar: 'https://example.test/legacy.jpg', name: 'Fictional user' }) }
  const options = { Model, userId, purpose, type, values, imageIds: [assetId], existingId, idempotencyFilter: { request: 'fictional-request' } }
  options.values.request = 'fictional-request'
  const dependencies = { Assets, connection, retire: async (ids) => { assert.equal(events.at(-2), 'commit'); retired.push(...ids) } }
  return { userId, assetId, documents, assets, options, dependencies, retired, events, fail: () => { fail = true }, run: (changes = {}) => commitContentImages({ ...options, ...changes }, dependencies) }
}

for (const [purpose, type] of [['avatar', 'user'], ['pet', 'pet'], ['sighting', 'sighting'], ['stray', 'stray'], ['message', 'message']]) {
  test(`${purpose}: attachment and repeated submission retain one content/asset relationship`, async () => {
    const f = fixture(purpose, type), first = await f.run(), again = await f.run()
    assert.equal(String(first.doc._id), String(again.doc._id))
    assert.equal(f.documents.size, 1)
    assert.equal(f.assets.get(f.assetId).state, 'attached')
    assert.equal(String(f.assets.get(f.assetId).attachedTo.id), String(first.doc._id))
    assert.equal(first.doc[type === 'user' ? 'avatar' : 'photo'], mediaContentUrl(f.assetId))
    assert.equal(f.retired.length, 0)
  })
  test(`${purpose}: foreign ownership/purpose and destination reuse are rejected`, async () => {
    for (const change of [{ uploadedBy: id() }, { purpose: 'wrong' }, { state: 'attached', attachedTo: { type, id: id() } }, { expiresAt: new Date(0).toISOString() }]) {
      const f = fixture(purpose, type)
      Object.assign(f.assets.get(f.assetId), change)
      await assert.rejects(f.run(), { code: 'IMAGE_ATTACHMENT_FORBIDDEN' })
      assert.equal(f.documents.size, type === 'user' ? 1 : 0)
    }
  })
  test(`${purpose}: database/replacement failure rolls back both references and asset claims`, async () => {
    const f = fixture(purpose, type), original = await f.run(), newId = id()
    f.assets.set(newId, { ...f.assets.get(f.assetId), _id: newId, state: 'pending', attachedTo: undefined })
    f.fail()
    await assert.rejects(f.run({ existingId: original.doc._id, imageIds: [newId] }), { code: 'IMAGE_DATABASE_UNAVAILABLE' })
    assert.equal(f.documents.get(String(original.doc._id))[type === 'user' ? 'avatar' : 'photo'], mediaContentUrl(f.assetId))
    assert.equal(f.assets.get(f.assetId).state, 'attached')
    assert.equal(f.assets.get(newId).state, 'pending')
    assert.deepEqual(f.retired, [])
  })
  test(`${purpose}: successful replacement retires only the old asset after commit`, async () => {
    const f = fixture(purpose, type), original = await f.run(), newId = id()
    f.assets.set(newId, { ...f.assets.get(f.assetId), _id: newId, state: 'pending', attachedTo: undefined })
    const replacement = await f.run({ existingId: original.doc._id, imageIds: [newId] })
    assert.equal(replacement.doc[type === 'user' ? 'avatar' : 'photo'], mediaContentUrl(newId))
    assert.equal(f.assets.get(f.assetId).state, 'delete_pending')
    assert.equal(f.assets.get(newId).state, 'attached')
    assert.deepEqual(f.retired, [f.assetId])
  })
}

test('missing/duplicate/excess image IDs and URL writes fail before DB operations', () => {
  for (const ids of [null, ['https://example.test/a.jpg'], [id(), id()], ['a'.repeat(24), 'a'.repeat(24)]]) assert.throws(() => validateImageIds(ids, 'avatar'))
  for (const field of ['photo', 'photos', 'avatar']) assert.throws(() => rejectImageStrings({ [field]: 'data:image/png;base64,AAAA' }), { code: 'IMAGE_IDS_REQUIRED' })
  assert.doesNotThrow(() => rejectImageStrings({ name: 'Fictional name' }))
})

test('concurrent unique-submission collision rechecks authorization and reuses the winning record', async () => {
  const f = fixture('pet', 'pet'), original = await f.run()
  const connection = f.dependencies.connection, startSession = connection.startSession
  let first = true, checks = 0
  connection.startSession = async function () {
    if (!first) return startSession.call(this)
    first = false
    return { async withTransaction() { throw Object.assign(new Error('Unique race'), { code: 11000 }) }, async endSession() {} }
  }
  const result = await f.run({ authorize: async () => { checks++ } })
  assert.equal(result.duplicate, true)
  assert.equal(String(result.doc._id), String(original.doc._id))
  assert.equal(f.documents.size, 1); assert.equal(checks, 1)
})
test('owners cannot attach to hidden content or edit somebody else; removal is explicit', async () => {
  const f = fixture('pet', 'pet'), original = await f.run()
  let row = f.documents.get(String(original.doc._id))
  row.moderationStatus = 'hidden'
  await assert.rejects(f.run({ existingId: row._id, imageIds: [] }), { code: 'IMAGE_NOT_FOUND' })
  row = f.documents.get(String(original.doc._id))
  row.moderationStatus = 'visible'; row.reportedBy = id()
  await assert.rejects(f.run({ existingId: row._id, imageIds: [] }), { code: 'IMAGE_ATTACHMENT_FORBIDDEN' })
  row = f.documents.get(String(original.doc._id))
  row.reportedBy = f.userId
  const removed = await f.run({ existingId: row._id, imageIds: [] })
  assert.equal(removed.doc.photo, '')
  assert.deepEqual(f.retired, [f.assetId])
})
test('legacy avatar is preserved until an explicit replacement/removal and files are not touched', async () => {
  const f = fixture('avatar', 'user')
  assert.equal(f.documents.get(f.userId).avatar, 'https://example.test/legacy.jpg')
  await f.run({ imageIds: [] })
  assert.equal(f.documents.get(f.userId).avatar, '')
  assert.deepEqual(f.retired, [])
})
test('incorrect database name fails before a transaction starts', async () => {
  const f = fixture('pet', 'pet'); f.dependencies.connection.name = 'incorrect-test-database'
  await assert.rejects(f.run(), { code: 'IMAGE_DATABASE_UNAVAILABLE' })
  assert.deepEqual(f.events, [])
})

test('managed replay validates payload both directly and after a duplicate-key retry, without changing attachments', async () => {
  const f = fixture('message', 'message')
  await f.run()
  const before = copy([...f.assets]), documents = copy([...f.documents])
  const values = { ...f.options.values, text: 'Changed payload' }
  const validateReplay = doc => assertMessageReplay(doc, values, [f.assetId])
  await assert.rejects(f.run({ values, validateReplay }), { code: 'SUBMISSION_CONFLICT', status: 409 })
  const originalFind = f.options.Model.findOne
  let attempt = 0, validations = 0
  f.options.Model.findOne = (...args) => {
    if (attempt++ === 0) return { select() { return this }, session() { return Promise.reject({ code: 11000 }) } }
    return originalFind(...args)
  }
  try {
    await assert.rejects(f.run({ values, validateReplay: doc => { validations++; validateReplay(doc) } }), { code: 'SUBMISSION_CONFLICT' })
    assert.equal(validations, 1); assert.equal(attempt, 2)
    assert.deepEqual([...f.assets], before); assert.deepEqual([...f.documents], documents)
    assert.deepEqual(f.retired, [])
  } finally { f.options.Model.findOne = originalFind }
})

for (const type of ['pet', 'stray']) {
  test(`${type}: four attachments preserve order and replay; fifth creation is rejected before a transaction`, async () => {
    const f = fixture(type, type)
    const ids = [f.assetId, id(), id(), id()]
    for (const imageId of ids.slice(1)) f.assets.set(imageId, { ...f.assets.get(f.assetId), _id: imageId })
    const saved = await f.run({ imageIds: ids })
    assert.deepEqual(saved.doc.photos, ids.map(mediaContentUrl))
    assert.equal(saved.doc.photo, mediaContentUrl(ids[0]))
    assert.deepEqual(contentImageReferences(saved.doc, type), ids.map(imageId => ({ id: imageId, url: mediaContentUrl(imageId) })))
    assert.equal((await f.run({ imageIds: ids })).duplicate, true)
    assert.equal(f.documents.size, 1)
    const events = [...f.events]
    await assert.rejects(f.run({ imageIds: [...ids, id()] }), { code: 'IMAGE_REQUEST_INVALID' })
    assert.deepEqual(f.events, events)
  })

  test(`${type}: older six-photo posts retain mixed references, reorder the cover and remove without deleting legacy files`, async () => {
    const f = fixture(type, type), original = await f.run()
    const urls = [mediaContentUrl(f.assetId), '/uploads/fictional-old.jpg', 'https://example.test/fictional.jpg', 'data:image/png;base64,AAAA', '/test-photos/dog.jpg', '/test-photos/cat.jpg']
    const doc = f.documents.get(String(original.doc._id))
    doc.photo = urls[0]; doc.photos = urls
    const reordered = [...urls].reverse()
    const changes = { existingId: doc._id, imageIds: undefined, attachments: reordered.map(existingUrl => ({ existingUrl })) }
    const result = await f.run(changes)
    assert.deepEqual(result.doc.photos, reordered)
    assert.equal(result.doc.photo, reordered[0])
    assert.deepEqual(contentImageReferences(result.doc, type), reordered.map(url => url === urls[0] ? { id: f.assetId, url } : { url }))
    assert.deepEqual((await f.run(changes)).doc.photos, reordered)
    const reduced = await f.run({ ...changes, attachments: reordered.slice(0, 5).map(existingUrl => ({ existingUrl })) })
    assert.equal(reduced.doc.photos.length, 5)
    assert.equal(f.assets.get(f.assetId).state, 'delete_pending')
    assert.deepEqual(f.retired, [f.assetId])
    assert.deepEqual(reduced.doc.imageIds, [])
  })

  test(`${type}: additions require a final total of four and failed saving leaves old attachments and pending asset retryable`, async () => {
    const f = fixture(type, type), original = await f.run()
    const urls = Array.from({ length: 6 }, (_, index) => `/uploads/fictional-${index}.jpg`)
    const doc = f.documents.get(String(original.doc._id))
    doc.photo = urls[0]; doc.photos = urls; doc.imageIds = []
    const newId = id()
    f.assets.set(newId, { ...f.assets.get(f.assetId), _id: newId, state: 'pending', attachedTo: undefined })
    const changes = { existingId: doc._id, imageIds: undefined }
    await assert.rejects(f.run({ ...changes, attachments: [...urls.slice(0, 4).map(existingUrl => ({ existingUrl })), { imageId: newId }] }), { code: 'IMAGE_REQUEST_INVALID' })
    assert.equal(f.assets.get(newId).state, 'pending')
    const valid = { ...changes, attachments: [{ imageId: newId }, ...urls.slice(0, 3).map(existingUrl => ({ existingUrl }))] }
    // Inject one destination-save failure after the pending asset has been claimed.
    const save = f.options.Model.prototype.save
    f.options.Model.prototype.save = async () => { throw new Error('Fictional edit failure') }
    try { await assert.rejects(f.run(valid), { code: 'IMAGE_DATABASE_UNAVAILABLE' }) }
    finally { f.options.Model.prototype.save = save }
    assert.deepEqual(f.documents.get(String(doc._id)).photos, urls)
    assert.equal(f.assets.get(newId).state, 'pending')
    assert.deepEqual(f.retired, [])
    const saved = await f.run(valid)
    assert.equal(saved.doc.photo, mediaContentUrl(newId))
    assert.deepEqual(saved.doc.photos, [mediaContentUrl(newId), ...urls.slice(0, 3)])
    assert.deepEqual((await f.run(valid)).doc.photos, saved.doc.photos)
    assert.equal(f.assets.get(newId).state, 'attached')
  })

  test(`${type}: retained URLs cannot inject foreign references or duplicate managed IDs`, async () => {
    const f = fixture(type, type), original = await f.run()
    const changes = { existingId: original.doc._id, imageIds: undefined }
    for (const attachments of [
      [{ existingUrl: '/uploads/unrelated.jpg' }],
      [{ existingUrl: `https://example.test${mediaContentUrl(f.assetId)}` }],
      [{ existingUrl: mediaContentUrl(f.assetId) }, { imageId: f.assetId }],
      [{ existingUrl: mediaContentUrl(f.assetId), imageId: f.assetId }],
    ]) await assert.rejects(f.run({ ...changes, attachments }))
    assert.equal(f.documents.get(String(original.doc._id)).photo, mediaContentUrl(f.assetId))
    const current = f.assets.get(f.assetId)
    current.attachedTo.id = id()
    await assert.rejects(f.run({ ...changes, attachments: [{ existingUrl: mediaContentUrl(f.assetId) }] }), { code: 'IMAGE_ATTACHMENT_FORBIDDEN' })
    assert.deepEqual(f.retired, [])
  })
}

test('rescue photo minimum and non-post attachment contracts remain enforced', async () => {
  const f = fixture('stray', 'stray'), original = await f.run()
  await assert.rejects(f.run({ existingId: original.doc._id, imageIds: undefined, attachments: [], minimum: 1 }), { code: 'IMAGE_REQUEST_INVALID' })
  const sighting = fixture('sighting', 'sighting'), saved = await sighting.run()
  await assert.rejects(sighting.run({ existingId: saved.doc._id, imageIds: undefined, attachments: [{ existingUrl: saved.doc.photo }] }), { code: 'IMAGE_REQUEST_INVALID' })
})
