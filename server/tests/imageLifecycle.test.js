import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { createImageLifecycle, mediaRepository } from '../services/imageLifecycle.js'

const userId = String(new mongoose.Types.ObjectId())
const input = { userId, purpose: 'pet', idempotencyKey: 'fixture-upload', buffer: Buffer.from('fixture') }
function setup({ count = 0 } = {}) {
  const records = new Map(), events = []
  const storage = {
    provider: 'cloudinary', publicIdFor: (_purpose, uuid) => `petlostapp/test/pets/${uuid}`,
    async uploadImage(_buffer, asset) {
      events.push('upload')
      return { provider: 'cloudinary', publicId: asset.publicId, providerAssetId: 'fixture-object', secureUrl: `https://res.cloudinary.com/fixture/${asset.publicId}.webp`, width: 10, height: 10, format: 'webp', bytes: 7 }
    },
    async deleteImage(asset) { events.push(`delete:${asset.publicId}`) },
  }
  const repository = {
    assertDatabase() {}, async count() { return count },
    async find(filter) {
      return [...records.values()].find((record) => Object.entries(filter).every(([key, value]) => String(record[key]) === String(value))) || null
    },
    async create(record) { events.push('reserve'); records.set(String(record._id), { ...record }) },
    async update(id, states, values) {
      const record = records.get(String(id))
      if (!record || !states.includes(record.state)) return false
      events.push(values.state); Object.assign(record, values); return true
    },
  }
  const options = { storage, repository, processor: async () => ({ buffer: input.buffer, checksum: 'a'.repeat(64), width: 10, height: 10, bytes: 7, format: 'webp' }), logger: () => {} }
  return { records, events, storage, repository, options, service: () => createImageLifecycle(options) }
}

test('successful upload reserves before provider call and returns only safe pending metadata', async () => {
  const f = setup(), response = await f.service().upload(input)
  assert.deepEqual(f.events, ['reserve', 'upload', 'pending'])
  assert.equal(response.duplicate, false)
  assert.match(response.image.url, /^\/api\/uploads\/managed\/[a-f0-9]+\/preview$/)
  assert.deepEqual(Object.keys(response.image).sort(), ['bytes', 'format', 'height', 'id', 'url', 'width'])
  assert.equal([...f.records.values()][0].state, 'pending')
  assert.equal([...f.records.values()][0].buffer, undefined)
})

test('same request reuses one object; different image/purpose cannot reuse its key', async () => {
  const f = setup(), first = await f.service().upload(input), retry = await f.service().upload(input)
  assert.equal(retry.duplicate, true)
  assert.equal(retry.image.id, first.image.id)
  assert.equal(f.events.filter((event) => event === 'upload').length, 1)
  await assert.rejects(f.service().upload({ ...input, purpose: 'stray' }), { code: 'IMAGE_IDEMPOTENCY_CONFLICT' })
  f.options.processor = async () => ({ checksum: 'b'.repeat(64) })
  await assert.rejects(f.service().upload(input), { code: 'IMAGE_IDEMPOTENCY_CONFLICT' })
})

test('reservation failure prevents all provider uploads', async () => {
  const f = setup()
  f.repository.create = async () => { throw new Error('database down') }
  await assert.rejects(f.service().upload(input), { code: 'IMAGE_DATABASE_UNAVAILABLE' })
  assert.deepEqual(f.events, [])
})

test('acknowledged metadata failure deletes only its exact reserved object', async () => {
  const f = setup(), update = f.repository.update
  f.repository.update = async (id, states, values) => {
    if (values.state === 'pending') throw new Error('write failed before commit')
    return update(id, states, values)
  }
  await assert.rejects(f.service().upload(input), { code: 'IMAGE_DATABASE_UNAVAILABLE' })
  const record = [...f.records.values()][0]
  assert.equal(record.state, 'deleted')
  assert.ok(f.events.includes(`delete:${record.publicId}`))
})

test('uncertain metadata write that committed is reconciled without deletion', async () => {
  const f = setup(), update = f.repository.update
  f.repository.update = async (id, states, values) => {
    const success = await update(id, states, values)
    if (values.state === 'pending') throw new Error('response lost after commit')
    return success
  }
  const result = await f.service().upload(input)
  assert.equal(result.image.id, String([...f.records.values()][0]._id))
  assert.equal(f.events.some((event) => event.startsWith('delete:')), false)
})

test('failed provider deletion keeps a durable delete_pending record', async () => {
  const f = setup()
  f.storage.uploadImage = async () => { throw new Error('timeout after remote creation') }
  f.storage.deleteImage = async () => { throw new Error('provider unavailable') }
  await assert.rejects(f.service().upload(input), { code: 'IMAGE_STORAGE_UNAVAILABLE' })
  const record = [...f.records.values()][0]
  assert.equal(record.state, 'delete_pending')
  assert.equal(record.failureCode, 'IMAGE_STORAGE_UNAVAILABLE')
})

test('a pre-existing provider object is never deleted on a public-ID collision', async () => {
  const f = setup()
  f.storage.uploadImage = async () => { throw Object.assign(new Error('collision'), { code: 'IMAGE_STORAGE_CONFLICT' }) }
  await assert.rejects(f.service().upload(input), { code: 'IMAGE_STORAGE_CONFLICT' })
  const record = [...f.records.values()][0]
  assert.equal(record.state, 'failed')
  assert.equal(record.failureCode, 'IMAGE_STORAGE_CONFLICT')
  assert.equal(f.events.some((event) => event.startsWith('delete:')), false)
})

test('complete database outage retains pre-upload reservation for reconciliation', async () => {
  const f = setup(), find = f.repository.find
  f.repository.find = async (filter) => {
    if (filter._id) throw new Error('database unreachable')
    return find(filter)
  }
  f.repository.update = async () => { throw new Error('database unreachable') }
  await assert.rejects(f.service().upload(input), { code: 'IMAGE_DATABASE_UNAVAILABLE' })
  assert.equal([...f.records.values()][0].state, 'uploading')
  assert.equal(f.events.some((event) => event.startsWith('delete:')), false)
})

test('duplicate-key concurrency never starts a second provider upload', async () => {
  const f = setup()
  f.repository.create = async () => { throw { code: 11000 } }
  await assert.rejects(f.service().upload(input), { code: 'IMAGE_UPLOAD_IN_PROGRESS' })
  assert.deepEqual(f.events, [])
})

test('recovery never deletes a record already attached by a concurrent operation', async () => {
  const f = setup(), update = f.repository.update
  f.repository.update = async (id, states, values) => {
    if (values.state === 'pending') {
      await update(id, states, { state: 'attached' })
      throw new Error('concurrent attachment')
    }
    return update(id, states, values)
  }
  await assert.rejects(f.service().upload(input), { code: 'IMAGE_DATABASE_UNAVAILABLE' })
  assert.equal([...f.records.values()][0].state, 'attached')
  assert.equal(f.events.some((event) => event.startsWith('delete:')), false)
})

test('invalid provider metadata triggers rollback instead of a broken pending reference', async () => {
  const f = setup(), upload = f.storage.uploadImage
  f.storage.uploadImage = async (...args) => ({ ...await upload(...args), bytes: 99 })
  await assert.rejects(f.service().upload(input), { code: 'IMAGE_STORAGE_UNAVAILABLE' })
  assert.equal([...f.records.values()][0].state, 'deleted')
})

test('daily/pending quotas reject before reservation or upload', async () => {
  for (const count of [10, 100]) {
    const f = setup({ count })
    await assert.rejects(f.service().upload(input), { code: 'IMAGE_UPLOAD_QUOTA' })
    assert.deepEqual(f.events, [])
  }
})

test('pending preview is uploader-only, unexpired and has no admin-role bypass', async () => {
  const f = setup(), result = await f.service().upload(input)
  assert.equal(String((await f.service().pendingForUser(result.image.id, userId))._id), result.image.id)
  await assert.rejects(f.service().pendingForUser(result.image.id, String(new mongoose.Types.ObjectId())), { code: 'IMAGE_NOT_FOUND' })
  const record = [...f.records.values()][0]
  record.expiresAt = new Date(0)
  await assert.rejects(f.service().pendingForUser(result.image.id, userId), { code: 'IMAGE_NOT_FOUND' })
})

test('wrong database or invalid input cannot start a provider operation', async () => {
  assert.throws(() => mediaRepository.assertDatabase(), { code: 'IMAGE_DATABASE_UNAVAILABLE' })
  const f = setup()
  await assert.rejects(f.service().upload({ ...input, userId: 'bad' }), { code: 'IMAGE_REQUEST_INVALID' })
  await assert.rejects(f.service().upload({ ...input, idempotencyKey: 'bad' }), { code: 'IMAGE_REQUEST_INVALID' })
  await assert.rejects(f.service().upload({ ...input, purpose: '__proto__' }), { code: 'IMAGE_PURPOSE_INVALID' })
  assert.deepEqual(f.events, [])
})
