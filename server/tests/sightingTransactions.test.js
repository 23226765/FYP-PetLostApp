import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import MediaAsset from '../models/MediaAsset.js'
import { createSightingSubmission } from '../services/sightingSubmission.js'
import { commitContentImages } from '../services/mediaAttachments.js'

// Opt-in real LOCAL replica-set verification; never uses the Atlas URI.
const uri = process.env.MEDIA_TEST_MONGODB_URI
test('real MongoDB sighting transactions: rollback, idempotency and concurrent reunion with/without images', {
  skip: !uri ? 'No isolated local replica-set configured (MEDIA_TEST_MONGODB_URI); mocked tests are separate.' : false,
}, async (t) => {
  const parsed = new URL(uri)
  assert.equal(parsed.protocol, 'mongodb:')
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))
  assert.ok(!parsed.username && !parsed.password)
  const database = `petlostapp_sighting_test_${randomUUID().replaceAll('-', '')}`
  const connection = await mongoose.createConnection(uri, { dbName: database, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 }).asPromise()
    .catch(() => { throw new Error('Isolated local test database unavailable; configuration withheld.') })
  const Pets = connection.model('Pet', Pet.schema.clone()), Sightings = connection.model('Sighting', Sighting.schema.clone()), Assets = connection.model('MediaAsset', MediaAsset.schema.clone())
  const petIds = [], assetIds = [], sightingIds = []
  try {
    const hello = await connection.db.admin().command({ hello: 1 })
    if (!hello.setName && hello.msg !== 'isdbgrid') { t.skip('Local database is not a replica set.'); return }
    for (const Model of [Pets, Sightings, Assets]) { await Model.createCollection(); await Model.createIndexes() }
    const options = { connection, Assets, expectedDatabase: database }
    for (const [withImage, initialStatus] of [[false, 'lost'], [false, 'sighted'], [true, 'lost'], [true, 'sighted']]) {
      const owner = new mongoose.Types.ObjectId(), reporter = new mongoose.Types.ObjectId()
      const petId = new mongoose.Types.ObjectId(); petIds.push(petId)
      await Pets.create({ _id: petId, reportedBy: owner, name: 'Isolated fictional pet', species: 'Dog', status: initialStatus, location: { type: 'Point', coordinates: [114.18, 22.3] } })
      const imageIds = []
      if (withImage) {
        const assetId = new mongoose.Types.ObjectId(); assetIds.push(assetId); imageIds.push(String(assetId))
        await Assets.create({ _id: assetId, provider: 'cloudinary', publicId: `petlostapp/test/sighting/${randomUUID()}`, uploadedBy: reporter, purpose: 'sighting', state: 'pending',
          checksum: 'a'.repeat(64), idempotencyKey: randomUUID(), expiresAt: new Date(Date.now() + 86400000), secureUrl: 'https://example.test/fixture.webp', width: 1, height: 1, bytes: 4, format: 'webp' })
      }
      const submissionId = randomUUID(), values = { pet: petId, reportedBy: reporter, submissionId, location: { type: 'Point', coordinates: [114.181, 22.301] }, locationName: 'Isolated fixture' }
      const input = { petId, userId: reporter, imageIds, submissionId, values }
      const submit = createSightingSubmission({ Pets, Sightings })
      await assert.rejects(submit({ ...input, values: { ...values, locationName: '' } }, options), { code: 'IMAGE_DATABASE_UNAVAILABLE' })
      assert.equal((await Pets.findById(petId)).status, initialStatus)
      assert.equal(await Sightings.countDocuments({ pet: petId }), 0)
      if (withImage) assert.equal((await Assets.findById(imageIds[0]).select('+state')).state, 'pending')

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
      await ready
      await Pets.updateOne({ _id: petId, reportedBy: owner }, { $set: { status: 'reunited' } })
      release(); await rejected
      assert.equal((await Pets.findById(petId)).status, 'reunited')
      assert.equal(await Sightings.countDocuments({ pet: petId }), 0)
      if (withImage) assert.equal((await Assets.findById(imageIds[0]).select('+state')).state, 'pending')

      await Pets.updateOne({ _id: petId }, { $set: { status: initialStatus } })
      const results = await Promise.all([submit(input, options), submit(input, options)])
      sightingIds.push(results[0].doc._id)
      assert.equal(String(results[0].doc._id), String(results[1].doc._id))
      assert.equal(await Sightings.countDocuments({ pet: petId }), 1)
      assert.equal((await Pets.findById(petId)).status, 'sighted')
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
    } finally { await connection.close() }
  }
})
