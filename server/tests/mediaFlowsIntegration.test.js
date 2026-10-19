import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import User from '../models/User.js'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import Stray from '../models/Stray.js'
import Message from '../models/Message.js'
import Notification from '../models/Notification.js'
import MediaAsset from '../models/MediaAsset.js'
import MediaUploadBudget from '../models/MediaUploadBudget.js'
import UserBlock from '../models/UserBlock.js'
import SavedStray from '../models/SavedStray.js'
import StrayComment from '../models/StrayComment.js'
import auth from '../routes/auth.js'
import pets from '../routes/pets.js'
import strays from '../routes/strays.js'
import chat from '../routes/chat.js'
import { createUploadsRouter } from '../routes/uploads.js'
import { errorHandler } from '../middleware/errorHandler.js'
import { resetRateLimitsForTests } from '../middleware/rateLimit.js'

// Real Express/JWT/controllers/models; DB/provider are deliberately isolated mocks.
const secret = 'Fictional!Media-Flow-Integration-Secret-2026'
const models = [User, Pet, Sighting, Stray, Message, Notification, MediaAsset, MediaUploadBudget, UserBlock, SavedStray, StrayComment]
const privateKeys = new Set(['token', 'refreshToken', 'JWT_SECRET', 'MONGODB_URI', 'CLOUDINARY_API_SECRET', 'publicId', 'providerAssetId', 'secureUrl', 'uploadedBy', 'imageIds', 'apiKey', 'apiSecret', 'moderationReason'])
function assertSafePayload(value) {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!privateKeys.has(key), `Prohibited image metadata field: ${key}`)
    assertSafePayload(child)
  }
}
const tables = new Map(models.map((Model) => [Model, new Map()]))
const restore = [], owner = new mongoose.Types.ObjectId(), finder = new mongoose.Types.ObjectId(), unrelated = new mongoose.Types.ObjectId(), admin = new mongoose.Types.ObjectId()
let server, url, petId, messageId, sightingId, failModel, reuniteAtStart, blocked = false
const snapshot = (value) => JSON.parse(JSON.stringify(value))
function match(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some((part) => match(row, part))
    if (key === '$and') return value.every((part) => match(row, part))
    const actual = key.split('.').reduce((r, k) => r?.[k], row)
    if (value?.$in) return value.$in.map(String).includes(String(actual))
    if (Object.hasOwn(value || {}, '$ne')) return String(actual) !== String(value.$ne)
    if (value?.$gt) return new Date(actual) > new Date(value.$gt)
    return String(actual) === String(value)
  })
}
function query(getter) {
  let lean = false
  return { select() { return this }, session() { return this }, populate() { return this }, sort() { return this }, skip() { return this }, limit() { return this },
    lean() { lean = true; return this }, then(resolve, reject) { return Promise.resolve().then(getter).then((value) => lean ? snapshot(value) : value).then(resolve, reject) } }
}
function patch(target, key, replacement) { const original = target[key]; restore.push(() => { target[key] = original }); target[key] = replacement }
function put(Model, values) { const doc = new Model(values); tables.get(Model).set(String(doc._id), snapshot(doc.toObject())); return doc }
function token(id) { return jwt.sign({ id: String(id) }, secret) }
function asset(actor, purpose) {
  return String(put(MediaAsset, { provider: 'cloudinary', publicId: `petlostapp/test/${purpose}/${new mongoose.Types.ObjectId()}`, uploadedBy: actor,
    purpose, state: 'pending', expiresAt: new Date(Date.now() + 86400000), checksum: 'a'.repeat(64), idempotencyKey: `fixture_${new mongoose.Types.ObjectId()}`,
    providerAssetId: 'fictional-object', secureUrl: 'https://res.cloudinary.com/fictional/test.webp', width: 1, height: 1, bytes: 4, format: 'webp' })._id)
}
async function request(path, actor, body, method = 'POST') {
  const response = await fetch(`${url}/api${path}`, { method, headers: { ...(actor ? { authorization: `Bearer ${token(actor)}` } : {}), 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  if (response.headers.get('content-type')?.includes('application/json')) assertSafePayload(await response.clone().json())
  return response
}
before(async () => {
  const oldSecret = process.env.JWT_SECRET; process.env.JWT_SECRET = secret
  restore.push(() => { if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret })
  const connection = mongoose.connection, oldName = connection.name, oldReady = connection.readyState
  connection.name = 'petlostapp'; connection.readyState = 1
  restore.push(() => { connection.name = oldName; connection.readyState = oldReady })
  patch(connection, 'startSession', async () => {
    if (reuniteAtStart) { tables.get(Pet).get(reuniteAtStart).status = 'reunited'; reuniteAtStart = null }
    return { async withTransaction(callback) {
    const beforeRows = new Map([...tables].map(([Model, rows]) => [Model, snapshot([...rows])]))
    try { await callback() } catch (error) { beforeRows.forEach((rows, Model) => { tables.set(Model, new Map(rows)) }); throw error }
  }, async endSession() {} } })
  for (const Model of models) {
    const read = (filter) => [...tables.get(Model).values()].filter((row) => match(row, filter)).map((row) => new Model(row))
    patch(Model, 'find', (filter = {}) => query(() => read(filter)))
    patch(Model, 'findOne', (filter) => query(() => read(filter)[0] || null))
    patch(Model, 'findById', (id) => query(() => read({ _id: id })[0] || null))
    patch(Model, 'exists', async (filter) => Model === UserBlock ? blocked : Boolean(read(filter)[0]))
    patch(Model, 'countDocuments', (filter) => query(() => read(filter).length))
    patch(Model, 'create', async (values) => {
      if (Array.isArray(values)) return Promise.all(values.map(async (value) => { const doc = new Model(value); await doc.save(); return doc }))
      const doc = new Model(values); await doc.save(); return doc
    })
    patch(Model, 'aggregate', async () => [])
    patch(Model, 'bulkWrite', async () => ({ matchedCount: 0 }))
    patch(Model.prototype, 'save', async function () {
      if (failModel === Model) throw new Error('Fictional DB failure')
      await this.validate(); tables.get(Model).set(String(this._id), snapshot(this.toObject())); return this
    })
    patch(Model, 'updateOne', async (filter, update, options = {}) => {
      const rows = read(filter)
      if (!rows.length && options.upsert) { const doc = new Model(update.$setOnInsert); await doc.save(); return { matchedCount: 0, upsertedCount: 1 } }
      if (!rows.length) return { matchedCount: 0 }
      const row = tables.get(Model).get(String(rows[0]._id)); Object.assign(row, snapshot(update.$set || {})); return { matchedCount: 1 }
    })
    patch(Model, 'updateMany', async (filter, update) => { read(filter).forEach((doc) => Object.assign(tables.get(Model).get(String(doc._id)), snapshot(update.$set || {}))) })
    patch(Model, 'findOneAndUpdate', (filter, update) => query(async () => {
      let doc = read(filter)[0]
      if (!doc) { doc = new Model(update.$setOnInsert); await doc.save() }
      return doc
    }))
  }
  for (const [id, name, role] of [[owner, 'Fictional owner', 'user'], [finder, 'Fictional finder', 'user'], [unrelated, 'Fictional unrelated user', 'user'], [admin, 'Fictional shelter', 'shelter_admin']]) {
    put(User, { _id: id, name, email: `${id}@example.test`, password: 'fictional-hash-not-a-password', phone: '+85250000101', role, avatar: '/uploads/legacy.jpg' })
  }
  const app = express(); app.use(express.json())
  app.use('/api/auth', auth); app.use('/api/pets', pets); app.use('/api/strays', strays); app.use('/api/chat', chat)
  app.use('/api/uploads', createUploadsRouter({ storageFactory: () => ({ openReadStream: async () => new Response(Buffer.from('safe')).body }) }))
  app.use(errorHandler)
  server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve))
  url = `http://127.0.0.1:${server.address().port}`
})
after(async () => { await new Promise((resolve) => server.close(resolve)); restore.reverse().forEach((fn) => fn()); resetRateLimitsForTests() })

test('avatar: unrelated profile edits preserve legacy images; new images attach via ID', async () => {
  let response = await request('/auth/me', owner, { name: 'Fictional owner renamed' }, 'PATCH')
  assert.equal(response.status, 200); assert.equal((await response.json()).user.avatar, '/uploads/legacy.jpg')
  const imageId = asset(owner, 'avatar')
  response = await request('/auth/me', owner, { avatarImageId: imageId }, 'PATCH')
  assert.equal(response.status, 200); assert.match((await response.json()).user.avatar, new RegExp(imageId))
  assert.equal((await request('/auth/me', finder, { avatarImageId: imageId }, 'PATCH')).status, 403)
})
test('pet: new image IDs create one report and repeated submission returns that report', async () => {
  const imageId = asset(owner, 'pet')
  const body = { name: 'Fictional Maple', species: 'Dog', district: 'Sha Tin', locationName: 'Fictional park', coordinates: [114.18, 22.3], imageIds: [imageId], submissionId: 'fictional_pet_001' }
  const first = await request('/pets/report', owner, body), firstBody = await first.json()
  assert.equal(first.status, 201); petId = firstBody.pet.id; assert.match(firstBody.pet.photo, new RegExp(imageId))
  const again = await request('/pets/report', owner, body); assert.equal(again.status, 200); assert.equal((await again.json()).pet.id, petId)
  assert.equal(tables.get(Pet).size, 1)
})
test('sighting: attaches once, owner/reporter delivery succeeds and unrelated/admin delivery fails', async () => {
  const imageId = asset(finder, 'sighting'), body = { location: { type: 'Point', coordinates: [114.181, 22.301] }, locationName: 'Fictional sighting', note: 'Private fixture details', imageIds: [imageId], submissionId: 'fictional_sighting_001' }
  const first = await request(`/pets/${petId}/sighting`, finder, body), result = await first.json()
  assert.equal(first.status, 201); sightingId = result.sighting.id
  const again = await request(`/pets/${petId}/sighting`, finder, body)
  assert.equal(again.status, 200); assert.equal((await again.json()).sighting.id, sightingId)
  for (const actor of [owner, finder]) assert.equal((await request(`/uploads/managed/${imageId}/content`, actor, undefined, 'GET')).status, 200)
  for (const actor of [undefined, unrelated, admin]) assert.equal((await request(`/uploads/managed/${imageId}/content`, actor, undefined, 'GET')).status, 404)
  for (const actor of [owner, finder, undefined, unrelated, admin]) {
    const history = await request(`/pets/${petId}/sightings`, actor, undefined, 'GET')
    assert.equal(history.status, 200)
    const entry = (await history.json()).sightings[0]
    const permitted = actor === owner || actor === finder
    assert.equal('note' in entry, permitted); assert.equal('photo' in entry, permitted)
    assert.equal(entry.locationPrecision, permitted ? 'exact' : 'approximate')
    if (permitted) { assert.equal(entry.note, body.note); assert.match(entry.photo, new RegExp(imageId)) }
  }
  const publicHistory = await request(`/pets/${petId}/sightings?view=public`, owner, undefined, 'GET')
  assert.equal('note' in (await publicHistory.json()).sightings[0], false)
  assert.equal(tables.get(Sighting).size, 1)
})

test('photo-free HTTP submissions are idempotent; legacy photo references obey the same role projection', async () => {
  const body = { location: { type: 'Point', coordinates: [114.182, 22.302] }, locationName: 'Fixture without image', note: 'Private photo-free note', submissionId: 'fictional_photo_free_001' }
  const first = await request(`/pets/${petId}/sighting`, finder, body)
  assert.equal(first.status, 201)
  const firstBody = await first.json()
  const duplicate = await request(`/pets/${petId}/sighting`, finder, body)
  assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).sighting.id, firstBody.sighting.id)
  assert.equal([...tables.get(Sighting).values()].filter((row) => row.submissionId === body.submissionId).length, 1)
  tables.get(Sighting).get(firstBody.sighting.id).photo = '/uploads/legacy-fixture.jpg'
  for (const actor of [owner, finder, undefined, unrelated, admin]) {
    const history = await request(`/pets/${petId}/sightings`, actor, undefined, 'GET')
    const entry = (await history.json()).sightings.find((row) => row.id === firstBody.sighting.id)
    const permitted = actor === owner || actor === finder
    assert.equal('note' in entry, permitted); assert.equal('photo' in entry, permitted)
  }
})

test('HTTP creation rolls back status/assets on write failure and loses safely to a concurrent reunion (mock DB)', async () => {
  for (const withImage of [false, true]) {
    const targetId = String(put(Pet, { name: 'Fictional concurrency pet', species: 'Dog', reportedBy: owner, location: { type: 'Point', coordinates: [114.18, 22.3] } })._id)
    const imageId = withImage ? asset(finder, 'sighting') : null
    const body = { location: { type: 'Point', coordinates: [114.181, 22.301] }, locationName: 'Fixture concurrency', submissionId: `fictional_concurrency_${targetId}`, imageIds: imageId ? [imageId] : [] }
    try {
      failModel = Sighting
      const failure = await request(`/pets/${targetId}/sighting`, finder, body)
      assert.equal(failure.status, 503)
      assert.equal(tables.get(Pet).get(targetId).status, 'lost')
      if (imageId) assert.equal(tables.get(MediaAsset).get(imageId).state, 'pending')
      failModel = null; reuniteAtStart = targetId
      const conflict = await request(`/pets/${targetId}/sighting`, finder, body)
      assert.equal(conflict.status, 409)
      assert.equal(tables.get(Pet).get(targetId).status, 'reunited')
      assert.equal([...tables.get(Sighting).values()].filter((row) => row.pet === targetId).length, 0)
      if (imageId) assert.equal(tables.get(MediaAsset).get(imageId).state, 'pending')
    } finally { failModel = null; reuniteAtStart = null }
  }
})
test('rescue: URLs survive serialization and guest image delivery is available for a visible post', async () => {
  const imageId = asset(finder, 'stray')
  const body = { species: 'Cat', condition: 'healthy', district: 'Sha Tin', locationName: 'Fictional rescue location', coordinates: [114.18, 22.3], description: 'Fictional cat', imageIds: [imageId], submissionId: 'fictional_stray_001' }
  const first = await request('/strays/report', finder, body), result = await first.json()
  assert.equal(first.status, 201); assert.match(result.stray.photo, new RegExp(imageId)); assert.equal(result.stray.photos.length, 1)
  const again = await request('/strays/report', finder, body); assert.equal(again.status, 200)
  const image = await request(`/uploads/managed/${imageId}/content`, undefined, undefined, 'GET')
  assert.equal(image.status, 200); assert.match(image.headers.get('cache-control'), /no-store/)
  assert.equal(await image.text(), 'safe')
})
test('chat: image-only message is idempotent and its binary obeys conversation/blocking restrictions', async () => {
  const imageId = asset(finder, 'message'), body = { text: '', imageIds: [imageId], clientRequestId: 'fictional_message_001' }
  const first = await request(`/chat/${petId}`, finder, body), result = await first.json()
  assert.equal(first.status, 201); assert.equal(result.duplicate, false); messageId = result.message.id
  const again = await request(`/chat/${petId}`, finder, body)
  assert.equal(again.status, 200)
  const replay = await again.json()
  assert.equal(replay.message.id, messageId); assert.equal(replay.duplicate, true); assert.equal(tables.get(Message).size, 1)
  assert.equal([...tables.get(Notification).values()].filter((row) => String(row.message) === messageId).length, 1)
  for (const actor of [owner, finder]) assert.equal((await request(`/uploads/managed/${imageId}/content`, actor, undefined, 'GET')).status, 200)
  for (const actor of [undefined, unrelated, admin]) assert.equal((await request(`/uploads/managed/${imageId}/content`, actor, undefined, 'GET')).status, 404)
  blocked = true
  assert.equal((await request(`/uploads/managed/${imageId}/content`, owner, undefined, 'GET')).status, 404)
  assert.equal((await request(`/chat/${petId}`, finder, { ...body, clientRequestId: 'fictional_message_002' })).status, 403)
  blocked = false
})
test('rescue HTTP role matrix exposes only executable author/status controls', async () => {
  const id = [...tables.get(Stray).keys()][0]
  for (const [actor, edit, status] of [[finder, true, true], [owner, false, false], [unrelated, false, false], [admin, false, true], [undefined, false, false]]) {
    const res = await request(`/strays/${id}`, actor, undefined, 'GET')
    assert.equal(res.status, 200)
    const { stray } = await res.json()
    assert.equal(stray.canEdit, edit); assert.equal(stray.canDelete, edit)
    assert.equal(stray.canUpdateStatus, status); assert.equal(stray.canManage, edit)
    if (!edit) {
      assert.equal((await request(`/strays/${id}`, actor, { description: 'Disallowed edit' }, 'PATCH')).status, actor ? 403 : 401)
      assert.equal((await request(`/strays/${id}`, actor, undefined, 'DELETE')).status, actor ? 403 : 401)
      assert.equal((await request(`/uploads/managed/content/stray/${id}`, actor, { imageIds: [] }, 'PATCH')).status, actor ? 403 : 401)
    }
    assert.equal((await request(`/strays/${id}/status`, actor, { status: 'reported' }, 'PATCH')).status, status ? 200 : actor ? 403 : 401)
  }
})

test('comment HTTP replay binds text/destination, hides hidden replay and never notifies a conflicting target', async () => {
  const id = [...tables.get(Stray).keys()][0], originalPopulate = StrayComment.prototype.populate
  StrayComment.prototype.populate = async function (field, select) { assert.equal(field, 'author'); assert.equal(select, 'name avatar'); return this }
  try {
    const body = { text: 'One fictional comment', submissionId: 'fictional_comment_repair' }
    assert.equal((await request(`/strays/${id}/comments`, undefined, body)).status, 401)
    const first = await request(`/strays/${id}/comments`, owner, body), payload = await first.json()
    assert.equal(first.status, 201); assert.equal(payload.duplicate, false)
    const again = await request(`/strays/${id}/comments`, owner, body), repeated = await again.json()
    assert.equal(again.status, 200); assert.equal(repeated.duplicate, true); assert.equal(repeated.comment.id, payload.comment.id)
    const notifications = tables.get(Notification).size
    const changed = await request(`/strays/${id}/comments`, owner, { ...body, text: 'Changed text' })
    assert.equal(changed.status, 409); assert.equal((await changed.json()).code, 'SUBMISSION_CONFLICT')
    const other = put(Stray, { ...tables.get(Stray).get(id), _id: new mongoose.Types.ObjectId(), submissionId: 'fictional_other_rescue' })
    assert.equal((await request(`/strays/${other._id}/comments`, owner, body)).status, 409)
    assert.equal(tables.get(Notification).size, notifications)
    tables.get(StrayComment).get(payload.comment.id).moderationStatus = 'hidden'
    assert.equal((await request(`/strays/${id}/comments`, owner, body)).status, 404)
    assert.equal(tables.get(StrayComment).size, 1)
  } finally { StrayComment.prototype.populate = originalPopulate }
})

test('chat HTTP retries reject changed text, destination, shared post and image/no-image payloads', async () => {
  const strayId = [...tables.get(Stray).keys()][0]
  const plain = { text: 'Plain message', clientRequestId: 'fictional_plain_repair' }
  const first = await request(`/chat/${petId}`, finder, plain)
  assert.equal(first.status, 201)
  const replay = await request(`/chat/${petId}`, finder, plain)
  assert.equal(replay.status, 200); assert.equal((await replay.json()).duplicate, true)
  const otherPet = put(Pet, { ...tables.get(Pet).get(petId), _id: new mongoose.Types.ObjectId(), submissionId: 'other-repair-pet' })
  const changes = [plain, { ...plain, text: 'Different' }, { ...plain, sharedStrayId: strayId }, { ...plain, imageIds: [asset(finder, 'message')] }]
  for (const [index, body] of changes.entries()) {
    const response = await request(`/chat/${index === 0 ? otherPet._id : petId}`, finder, body)
    assert.equal(response.status, 409); assert.equal((await response.json()).code, 'SUBMISSION_CONFLICT')
  }
  for (const body of [{ text: 'Image removed', clientRequestId: 'fictional_message_001' },
    { text: 'Image text changed', imageIds: [...tables.get(Message).values()].find(row => row.clientRequestId === 'fictional_message_001').imageIds, clientRequestId: 'fictional_message_001' }]) {
    assert.equal((await request(`/chat/${petId}`, finder, body)).status, 409)
  }
})

test('legacy Base64/arbitrary URL public writes are rejected in every category', async () => {
  for (const [path, actor, body, method] of [['/auth/register', undefined, { avatar: 'data:image/png;base64,AAAA' }], ['/auth/me', owner, { avatar: 'data:image/png;base64,AAAA' }, 'PATCH'], ['/pets/report', owner, { photo: 'https://example.test/arbitrary.jpg' }],
    [`/pets/${petId}/sighting`, finder, { photo: 'data:image/png;base64,AAAA' }], ['/strays/report', finder, { photos: ['/uploads/new.jpg'] }], [`/chat/${petId}`, finder, { text: 'test', photo: 'https://example.test/arbitrary.jpg' }]]) {
    const response = await request(path, actor, body, method || 'POST')
    assert.equal(response.status, 400); assert.equal((await response.json()).code, 'IMAGE_IDS_REQUIRED')
  }
})
test('failed avatar replacement preserves the original; hidden targets and foreign editors are denied', async () => {
  const previous = tables.get(User).get(String(owner)).avatar, replacement = asset(owner, 'avatar')
  failModel = User
  assert.equal((await request('/auth/me', owner, { avatarImageId: replacement }, 'PATCH')).status, 503)
  failModel = null
  assert.equal(tables.get(User).get(String(owner)).avatar, previous)
  assert.equal(tables.get(MediaAsset).get(replacement).state, 'pending')
  assert.equal((await request(`/uploads/managed/content/pet/${petId}`, finder, { imageIds: [] }, 'PATCH')).status, 403)
  const row = tables.get(Pet).get(petId); row.moderationStatus = 'hidden'
  assert.equal((await request(`/uploads/managed/content/pet/${petId}`, owner, { imageIds: [] }, 'PATCH')).status, 404)
  assert.equal((await request(`/uploads/managed/content/sighting/${sightingId}`, finder, { imageIds: [] }, 'PATCH')).status, 404)
})
