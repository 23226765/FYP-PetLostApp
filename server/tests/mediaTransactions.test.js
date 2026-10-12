import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import Pet from '../models/Pet.js'
import MediaAsset from '../models/MediaAsset.js'
import { commitContentImages } from '../services/mediaAttachments.js'
import { openTransactionDatabase } from './helpers/localTransactions.js'

// Opt-in LOCAL replica-set test only. Never read the application's Atlas URI.
const uri = process.env.MEDIA_TEST_MONGODB_URI
test('real MongoDB transactions atomically attach, roll back and replace images', {
  skip: !uri ? 'No isolated local replica-set URI configured (MEDIA_TEST_MONGODB_URI).' : false,
  timeout: 120000,
}, async (t) => {
  const { connection, database } = await openTransactionDatabase(uri, 'media', t)
  const petSchema = Pet.schema.clone()
  let observedUncommittedInsert = false
  petSchema.post('save', async function () {
    if (this.description !== 'inject-after-real-insert') return
    assert.ok(this.$session()?.inTransaction())
    assert.equal(await this.constructor.countDocuments({ _id: this._id }).session(this.$session()), 1)
    observedUncommittedInsert = true
    throw new Error('Isolated injected failure after acknowledged insert')
  })
  const PetModel = connection.model('Pet', petSchema)
  const Assets = connection.model('MediaAsset', MediaAsset.schema.clone())
  const assetIds = [], contentIds = []
  const owner = new mongoose.Types.ObjectId()
  try {
    await PetModel.createCollection(); await Assets.createCollection()
    await PetModel.createIndexes(); await Assets.createIndexes()
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
    let attached
    await t.test('successful attachment and duplicate retry commit one content/asset relationship', async () => {
      attached = await commitContentImages(input, options); contentIds.push(attached.doc._id)
      assert.equal(await PetModel.countDocuments(input.idempotencyFilter), 1)
      const asset = await Assets.findById(first._id).select('+state +attachedTo')
      assert.equal(asset.state, 'attached')
      assert.equal(String(asset.attachedTo.id), String(attached.doc._id))
      const duplicate = await commitContentImages(input, options)
      assert.equal(String(duplicate.doc._id), String(attached.doc._id))
      assert.equal(duplicate.duplicate, true)
    })
    await t.test('failed replacement after asset claim preserves previous reference; retry succeeds', async () => {
      await assert.rejects(commitContentImages({ ...input, existingId: attached.doc._id, values: { name: '' }, imageIds: [String(second._id)] }, options), { code: 'IMAGE_DATABASE_UNAVAILABLE' })
      const replacement = await Assets.findById(second._id).select('+state +attachedTo')
      assert.equal(replacement.state, 'pending'); assert.equal(replacement.attachedTo, undefined)
      assert.equal((await Assets.findById(first._id).select('+state')).state, 'attached')
      assert.equal((await PetModel.findById(attached.doc._id)).photo, attached.doc.photo)
      assert.deepEqual(retired, [])
      const retry = { ...input, existingId: attached.doc._id, values: {}, imageIds: [String(second._id)] }
      await commitContentImages(retry, options)
      await commitContentImages(retry, options)
      assert.equal((await Assets.findById(first._id).select('+state')).state, 'delete_pending')
      assert.equal((await Assets.findById(second._id).select('+state')).state, 'attached')
      assert.deepEqual(retired, [String(first._id)], 'Provider retirement occurs only after acknowledged replacement, once')
    })
    await t.test('failed creation rolls back claimed image and does not create an orphan; retry commits', async () => {
      const image = await pending(), submissionId = randomUUID()
      const request = { ...input, imageIds: [String(image._id)], values: { ...input.values, submissionId }, idempotencyFilter: { reportedBy: owner, submissionId } }
      await assert.rejects(commitContentImages({ ...request, values: { ...request.values, name: '' } }, options), { code: 'IMAGE_DATABASE_UNAVAILABLE' })
      assert.equal(await PetModel.countDocuments(request.idempotencyFilter), 0)
      assert.equal((await Assets.findById(image._id).select('+state')).state, 'pending')
      await assert.rejects(commitContentImages({ ...request, values: { ...request.values, description: 'inject-after-real-insert' } }, options), { code: 'IMAGE_DATABASE_UNAVAILABLE' })
      assert.equal(observedUncommittedInsert, true, 'The injected failure must occur after a real MongoDB insert')
      assert.equal(await PetModel.countDocuments(request.idempotencyFilter), 0)
      const rolledBack = await Assets.findById(image._id).select('+state +attachedTo')
      assert.equal(rolledBack.state, 'pending'); assert.equal(rolledBack.attachedTo, undefined)
      const result = await commitContentImages(request, options); contentIds.push(result.doc._id)
      assert.equal(await PetModel.countDocuments(request.idempotencyFilter), 1)
    })
    await t.test('simultaneous identical submissions return the same committed document', async () => {
      const image = await pending(), submissionId = randomUUID()
      const request = { ...input, imageIds: [String(image._id)], values: { ...input.values, submissionId }, idempotencyFilter: { reportedBy: owner, submissionId } }
      const settled = await Promise.allSettled([commitContentImages(request, options), commitContentImages(request, options)])
      assert.ok(settled.every((result) => result.status === 'fulfilled'), 'Both identical submissions must succeed')
      const results = settled.map((result) => result.value)
      contentIds.push(results[0].doc._id)
      assert.equal(String(results[0].doc._id), String(results[1].doc._id))
      assert.equal(results.filter((result) => result.duplicate).length, 1)
      assert.equal(await PetModel.countDocuments(request.idempotencyFilter), 1)
    })
    await t.test('concurrent destinations cannot claim the same pending asset twice', async () => {
      const image = await pending()
      const requests = [randomUUID(), randomUUID()].map((submissionId) => ({ ...input, imageIds: [String(image._id)],
        values: { ...input.values, submissionId }, idempotencyFilter: { reportedBy: owner, submissionId } }))
      const results = await Promise.allSettled(requests.map((request) => commitContentImages(request, options)))
      const winners = results.filter((result) => result.status === 'fulfilled')
      const losers = results.filter((result) => result.status === 'rejected')
      assert.equal(winners.length, 1); assert.equal(losers.length, 1)
      contentIds.push(winners[0].value.doc._id)
      assert.equal(losers[0].reason.code, 'IMAGE_ATTACHMENT_FORBIDDEN')
      assert.equal(await PetModel.countDocuments({ submissionId: { $in: requests.map((request) => request.values.submissionId) } }), 1)
      const asset = await Assets.findById(image._id).select('+state +attachedTo')
      assert.equal(asset.state, 'attached'); assert.equal(String(asset.attachedTo.id), String(winners[0].value.doc._id))
    })
    await t.test('concurrent replacements leave exactly one current asset and retire only detached assets', async () => {
      const images = [await pending(), await pending()]
      const results = await Promise.allSettled(images.map((image) => commitContentImages({ ...input, existingId: attached.doc._id, values: {}, imageIds: [String(image._id)] }, options)))
      assert.ok(results.every((result) => result.status === 'fulfilled'), 'Replacements must serialize successfully')
      const current = await PetModel.findById(attached.doc._id).select('+imageIds')
      assert.equal(current.imageIds.length, 1)
      const winner = String(current.imageIds[0]), loser = String(images.find((image) => String(image._id) !== winner)._id)
      assert.equal(current.photo, `/api/uploads/managed/${winner}/content`)
      assert.equal((await Assets.findById(winner).select('+state')).state, 'attached')
      assert.equal((await Assets.findById(loser).select('+state')).state, 'delete_pending')
      assert.equal((await Assets.findById(second._id).select('+state')).state, 'delete_pending')
      assert.equal(retired.filter((id) => id === loser).length, 1)
      assert.ok(!retired.includes(winner))
    })
  } finally {
    // Exact IDs created by this test only; no dropDatabase, seeds, or broad deletion.
    try {
      const created = await PetModel.find({ reportedBy: owner }).select('_id').lean()
      contentIds.push(...created.map((pet) => pet._id))
      if (contentIds.length) await PetModel.deleteMany({ _id: { $in: contentIds } })
      if (assetIds.length) await Assets.deleteMany({ _id: { $in: assetIds } })
      assert.equal(await PetModel.countDocuments({ _id: { $in: contentIds } }), 0)
      assert.equal(await Assets.countDocuments({ _id: { $in: assetIds } }), 0)
      t.diagnostic('Exact isolated media fixture cleanup verified: zero remaining tracked records; provider calls mocked.')
    } finally { await connection.close() }
  }
})
