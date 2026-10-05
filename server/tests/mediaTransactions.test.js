import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import Pet from '../models/Pet.js'
import MediaAsset from '../models/MediaAsset.js'
import { commitContentImages } from '../services/mediaAttachments.js'

// Opt-in LOCAL replica-set test only. Never read the application's Atlas URI.
const uri = process.env.MEDIA_TEST_MONGODB_URI
test('real MongoDB transactions atomically attach, roll back and replace images', {
  skip: !uri ? 'No isolated local replica-set URI configured (MEDIA_TEST_MONGODB_URI).' : false,
}, async (t) => {
  let parsed
  try { parsed = new URL(uri) } catch { throw new Error('Invalid isolated MongoDB test configuration.') }
  assert.equal(parsed.protocol, 'mongodb:')
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname), 'Only an isolated loopback MongoDB is allowed; Atlas is prohibited')
  assert.ok(!parsed.username && !parsed.password, 'Use a credential-free isolated local test replica set; never application credentials')
  const database = `petlostapp_media_test_${randomUUID().replaceAll('-', '')}`
  const connection = await mongoose.createConnection(uri, { dbName: database, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 }).asPromise()
    .catch(() => { throw new Error('Isolated local MongoDB test connection failed; connection details withheld.') })
  const PetModel = connection.model('Pet', Pet.schema.clone())
  const Assets = connection.model('MediaAsset', MediaAsset.schema.clone())
  const assetIds = [], contentIds = []
  try {
    const hello = await connection.db.admin().command({ hello: 1 })
    if (!hello.setName && hello.msg !== 'isdbgrid') { t.skip('Local MongoDB is not a replica set; transactions unavailable.'); return }
    await PetModel.createCollection(); await Assets.createCollection()
    await PetModel.createIndexes(); await Assets.createIndexes()
    const owner = new mongoose.Types.ObjectId()
    async function pending() {
      const _id = new mongoose.Types.ObjectId(); assetIds.push(_id)
      return Assets.create({ _id, provider: 'cloudinary', publicId: `petlostapp/test/pets/${randomUUID()}`, providerAssetId: randomUUID(),
        secureUrl: 'https://res.cloudinary.com/fictional/image/authenticated/fixture.webp', width: 16, height: 16, bytes: 100, format: 'webp',
        uploadedBy: owner, purpose: 'pet', state: 'pending', checksum: 'a'.repeat(64), idempotencyKey: randomUUID(), expiresAt: new Date(Date.now() + 86400000) })
    }
    const first = await pending(), second = await pending(), retired = []
    const input = { Model: PetModel, type: 'pet', purpose: 'pet', userId: owner, imageIds: [String(first._id)],
      values: { name: 'Fictional transaction fixture', species: 'Dog', reportedBy: owner, submissionId: randomUUID(), location: { type: 'Point', coordinates: [114.17, 22.3] } } }
    input.idempotencyFilter = { reportedBy: owner, submissionId: input.values.submissionId }
    const options = { Assets, connection, expectedDatabase: database, retire: async (ids) => { retired.push(...ids) } }
    const attached = await commitContentImages(input, options); contentIds.push(attached.doc._id)
    assert.equal(await PetModel.countDocuments(input.idempotencyFilter), 1)
    assert.equal((await Assets.findById(first._id).select('+state')).state, 'attached')
    const duplicate = await commitContentImages(input, options)
    assert.equal(String(duplicate.doc._id), String(attached.doc._id))
    assert.equal(duplicate.duplicate, true)
    await assert.rejects(commitContentImages({ ...input, existingId: attached.doc._id, values: { name: '' }, imageIds: [String(second._id)] }, options), { code: 'IMAGE_DATABASE_UNAVAILABLE' })
    assert.equal((await Assets.findById(second._id).select('+state')).state, 'pending')
    assert.equal((await Assets.findById(first._id).select('+state')).state, 'attached')
    assert.equal((await PetModel.findById(attached.doc._id)).photo, attached.doc.photo)
    assert.deepEqual(retired, [])
    await commitContentImages({ ...input, existingId: attached.doc._id, values: {}, imageIds: [String(second._id)] }, options)
    assert.equal((await Assets.findById(first._id).select('+state')).state, 'delete_pending')
    assert.equal((await Assets.findById(second._id).select('+state')).state, 'attached')
    assert.deepEqual(retired, [String(first._id)])
  } finally {
    // Exact IDs created by this test only; no dropDatabase, seeds, or broad deletion.
    try {
      if (contentIds.length) await PetModel.deleteMany({ _id: { $in: contentIds } })
      if (assetIds.length) await Assets.deleteMany({ _id: { $in: assetIds } })
      assert.equal(await PetModel.countDocuments({ _id: { $in: contentIds } }), 0)
      assert.equal(await Assets.countDocuments({ _id: { $in: assetIds } }), 0)
    } finally { await connection.close() }
  }
})
