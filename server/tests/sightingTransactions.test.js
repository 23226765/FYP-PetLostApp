import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import MediaAsset from '../models/MediaAsset.js'
import { createSightingSubmission } from '../services/sightingSubmission.js'
import { commitContentImages } from '../services/mediaAttachments.js'
import { openTransactionDatabase } from './helpers/localTransactions.js'

// Opt-in real LOCAL replica-set verification; never uses the Atlas URI.
const uri = process.env.MEDIA_TEST_MONGODB_URI
test('real MongoDB sighting transactions: rollback, idempotency and concurrent reunion with/without images', {
  skip: !uri ? 'No isolated local replica-set configured (MEDIA_TEST_MONGODB_URI); mocked tests are separate.' : false,
  timeout: 120000,
}, async (t) => {
  const { connection, database } = await openTransactionDatabase(uri, 'sighting', t)
  const Pets = connection.model('Pet', Pet.schema.clone())
  const sightingSchema = Sighting.schema.clone()
  let insertedFailureCount = 0
  sightingSchema.post('save', async function () {
    if (this.note !== 'inject-after-real-insert') return
    const session = this.$session()
    assert.ok(session?.inTransaction())
    assert.equal(await this.constructor.countDocuments({ _id: this._id }).session(session), 1)
    assert.equal((await Pets.findById(this.pet).session(session)).status, 'sighted')
    insertedFailureCount++
    throw new Error('Isolated injected failure after sighting/status database writes')
  })
  const Sightings = connection.model('Sighting', sightingSchema), Assets = connection.model('MediaAsset', MediaAsset.schema.clone())
  const petIds = [], assetIds = [], sightingIds = []
  try {
    for (const Model of [Pets, Sightings, Assets]) { await Model.createCollection(); await Model.createIndexes() }
    const options = { connection, Assets, expectedDatabase: database, retire: async () => { assert.fail('A new sighting must not retire provider objects') } }
    for (const [withImage, initialStatus] of [[false, 'lost'], [false, 'sighted'], [true, 'lost'], [true, 'sighted']]) {
      await t.test(`${initialStatus}, ${withImage ? 'managed image' : 'photo-free'}: rollback, concurrent reunion, duplicate commit and retry`, async () => {
      const owner = new mongoose.Types.ObjectId(), reporter = new mongoose.Types.ObjectId()
      const petId = new mongoose.Types.ObjectId(); petIds.push(petId)
      await Pets.create({ _id: petId, reportedBy: owner, name: 'Isolated fictional pet', species: 'Dog', status: initialStatus, location: { type: 'Point', coordinates: [114.18, 22.3] } })
      const imageIds = []
      if (withImage) {
        const assetId = new mongoose.Types.ObjectId(); assetIds.push(assetId); imageIds.push(String(assetId))
        await Assets.create({ _id: assetId, provider: 'cloudinary', publicId: `petlostapp/test/sighting/${randomUUID()}`, providerAssetId: randomUUID(), uploadedBy: reporter, purpose: 'sighting', state: 'pending',
          checksum: 'a'.repeat(64), idempotencyKey: randomUUID(), expiresAt: new Date(Date.now() + 86400000), secureUrl: 'https://res.cloudinary.com/fictional/image/authenticated/fixture.webp', width: 1, height: 1, bytes: 4, format: 'webp' })
      }
      const submissionId = randomUUID(), values = { pet: petId, reportedBy: reporter, submissionId, location: { type: 'Point', coordinates: [114.181, 22.301] }, locationName: 'Isolated fixture' }
      const input = { petId, userId: reporter, imageIds, submissionId, values }
      const submit = createSightingSubmission({ Pets, Sightings })
      await assert.rejects(submit({ ...input, values: { ...values, locationName: '' } }, options), { code: 'IMAGE_DATABASE_UNAVAILABLE' })
      assert.equal((await Pets.findById(petId)).status, initialStatus)
      assert.equal(await Sightings.countDocuments({ pet: petId }), 0)
      if (withImage) assert.equal((await Assets.findById(imageIds[0]).select('+state')).state, 'pending')
      const priorFailures = insertedFailureCount
      await assert.rejects(submit({ ...input, values: { ...values, note: 'inject-after-real-insert' } }, options), { code: 'IMAGE_DATABASE_UNAVAILABLE' })
      assert.equal(insertedFailureCount, priorFailures + 1, 'Failure was injected after actual sighting and status database writes')
      assert.equal((await Pets.findById(petId)).status, initialStatus)
      assert.equal(await Sightings.countDocuments({ pet: petId }), 0)
      if (withImage) {
        const rolledBack = await Assets.findById(imageIds[0]).select('+state +attachedTo')
        assert.equal(rolledBack.state, 'pending'); assert.equal(rolledBack.attachedTo, undefined)
      }

      // Pause after the transaction snapshot read, perform an independent
      // owner's write, then let the conflicting transaction retry for real.
      let release, snapshotReady, first = true
      const ready = new Promise((resolve) => { snapshotReady = resolve })
      const gate = new Promise((resolve) => { release = resolve })
      const racing = createSightingSubmission({ Pets, Sightings, commit: (args, deps) => commitContentImages({ ...args,
        beforeCreate: async (session) => { if (first) { first = false; snapshotReady(); await gate } await args.beforeCreate(session) },
      }, deps) })
      const attempted = racing(input, options)
      const rejected = assert.rejects(attempted, { status: 409, code: 'PET_NOT_ACCEPTING_SIGHTINGS' })
      try {
        // Fail promptly if the transaction fails before reaching the barrier.
        await Promise.race([ready, attempted.then(() => { throw new Error('Sighting bypassed the concurrency barrier') })])
        await Pets.updateOne({ _id: petId, reportedBy: owner, status: { $in: ['lost', 'sighted'] } }, { $set: { status: 'reunited' } })
      } finally { release(); await rejected }
      assert.equal((await Pets.findById(petId)).status, 'reunited')
      assert.equal(await Sightings.countDocuments({ pet: petId }), 0)
      if (withImage) assert.equal((await Assets.findById(imageIds[0]).select('+state')).state, 'pending')

      await Pets.updateOne({ _id: petId }, { $set: { status: initialStatus } })
      const settled = await Promise.allSettled([submit(input, options), submit(input, options)])
      assert.ok(settled.every((result) => result.status === 'fulfilled'), 'Concurrent duplicate sighting requests must both succeed')
      const results = settled.map((result) => result.value)
      sightingIds.push(results[0].doc._id)
      assert.equal(String(results[0].doc._id), String(results[1].doc._id))
      assert.equal(await Sightings.countDocuments({ pet: petId }), 1)
      assert.equal((await Pets.findById(petId)).status, 'sighted')
      assert.equal(results.filter((result) => result.duplicate).length, 1)
      if (withImage) {
        const asset = await Assets.findById(imageIds[0]).select('+state +attachedTo')
        assert.equal(asset.state, 'attached'); assert.equal(String(asset.attachedTo.id), String(results[0].doc._id))
      }
      // Opposite ordering: an acknowledged sighting followed by reunion.
      // Retrying that sighting must not reopen the pet or create another report.
      await Pets.updateOne({ _id: petId, reportedBy: owner }, { $set: { status: 'reunited' } })
      const retry = await submit(input, options)
      assert.equal(retry.duplicate, true)
      assert.equal(String(retry.doc._id), String(results[0].doc._id))
      assert.equal((await Pets.findById(petId)).status, 'reunited')
      assert.equal(await Sightings.countDocuments({ pet: petId }), 1)
      const lateSubmission = randomUUID()
      await assert.rejects(submit({ ...input, submissionId: lateSubmission, values: { ...values, submissionId: lateSubmission }, imageIds: [] }, options),
        { status: 409, code: 'PET_NOT_ACCEPTING_SIGHTINGS' })
      assert.equal(await Sightings.countDocuments({ pet: petId }), 1)
      })
    }
  } finally {
    // Exact records in this unique isolated DB only; no Atlas, seeds or scans.
    try {
      // Also capture an acknowledged commit if a parallel test request failed
      // before Promise.all returned. Resolve exact IDs only under our own pets.
      if (petIds.length) {
        const created = await Sightings.find({ pet: { $in: petIds } }).select('_id').lean()
        sightingIds.push(...created.map((sighting) => sighting._id))
      }
      if (sightingIds.length) await Sightings.deleteMany({ _id: { $in: sightingIds } })
      if (assetIds.length) await Assets.deleteMany({ _id: { $in: assetIds } })
      if (petIds.length) await Pets.deleteMany({ _id: { $in: petIds } })
      assert.equal(await Pets.countDocuments({ _id: { $in: petIds } }), 0)
      assert.equal(await Sightings.countDocuments({ pet: { $in: petIds } }), 0)
      assert.equal(await Assets.countDocuments({ _id: { $in: assetIds } }), 0)
      t.diagnostic('Exact isolated sighting fixture cleanup verified: zero remaining tracked records.')
    } finally { await connection.close() }
  }
})
