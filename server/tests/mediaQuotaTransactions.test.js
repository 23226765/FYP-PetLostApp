import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import MediaAsset from '../models/MediaAsset.js'
import MediaUploadBudget from '../models/MediaUploadBudget.js'
import Pet from '../models/Pet.js'
import { createUploadReservation, uploadQuotaFilters } from '../services/mediaQuota.js'
import { createMediaReconciler } from '../services/mediaReconciliation.js'
import { IMAGE_LIMITS } from '../config/imageStorage.js'
import { mediaRepository } from '../services/imageLifecycle.js'
import { openTransactionDatabase } from './helpers/localTransactions.js'

const uri = process.env.MEDIA_TEST_MONGODB_URI
test('real local upload quotas and exact recovery: expiry boundaries, concurrent reservations, debt and rollback', {
  skip: !uri ? 'Isolated local replica-set required; no application database is used.' : false, timeout: 120000,
}, async (t) => {
  const { connection, database } = await openTransactionDatabase(uri, 'quota', t)
  const Assets = connection.model('MediaAsset', MediaAsset.schema.clone())
  const Budgets = connection.model('MediaUploadBudget', MediaUploadBudget.schema.clone())
  const Pets = connection.model('Pet', Pet.schema.clone())
  const ids = [], owners = [], petIds = []
  let clock = new Date()
  const owner = () => { const id = new mongoose.Types.ObjectId(); owners.push(id); return id }
  const values = (uploadedBy, extra = {}) => {
    const id = new mongoose.Types.ObjectId(); ids.push(id)
    return { _id: id, provider: 'cloudinary', publicId: `petlostapp/test/pets/${randomUUID()}`, providerAssetId: randomUUID(),
      secureUrl: 'https://res.cloudinary.com/fictional/image/authenticated/fixture.webp', width: 8, height: 8, bytes: 16, format: 'webp',
      uploadedBy, purpose: 'pet', state: 'pending', checksum: 'a'.repeat(64), idempotencyKey: randomUUID(),
      expiresAt: new Date(clock.getTime() + 86400000), ...extra }
  }
  try {
    for (const Model of [Assets, Budgets, Pets]) { await Model.createCollection(); await Model.createIndexes() }
    const reserve = createUploadReservation({ Assets, Budgets, connection, expectedDatabase: database })
    await t.test('ten expired legacy reservations release pending slots but retain storage debt and identity', async () => {
      const uploader = owner()
      const expired = Array.from({ length: 10 }, () => values(uploader, { expiresAt: clock, createdAt: new Date(clock.getTime() - 172800000) }))
      await Assets.insertMany(expired)
      const filters = uploadQuotaFilters(uploader, clock)
      assert.equal(await Assets.countDocuments(filters.active), 0)
      assert.equal(await Assets.countDocuments(filters.stored), 10)
      await reserve(values(uploader, { state: 'uploading', uploadLeaseToken: randomUUID(), uploadLeaseUntil: new Date(clock.getTime() + 120000) }), clock)
      assert.equal(await Assets.countDocuments({ uploadedBy: uploader }), 11)
      const preserved = await Assets.findById(expired[0]._id).select('+publicId +idempotencyKey +state')
      assert.equal(preserved.publicId, expired[0].publicId); assert.equal(preserved.state, 'pending')
    })
    await t.test('strict expiry/lease boundaries and legacy active uploads are respected', async () => {
      const uploader = owner(), future = new Date(clock.getTime() + 1)
      await Assets.insertMany([
        values(uploader, { expiresAt: clock }), values(uploader, { expiresAt: future }),
        values(uploader, { state: 'uploading', uploadLeaseUntil: future, expiresAt: new Date(0) }),
        values(uploader, { state: 'uploading', uploadLeaseUntil: clock }),
        values(uploader, { state: 'uploading' }),
      ])
      assert.equal(await Assets.countDocuments(uploadQuotaFilters(uploader, clock).active), 3)
    })
    await t.test('real heartbeat predicate extends only an active matching uploading lease', async () => {
      const uploader = owner(), token = randomUUID()
      const rows = [
        values(uploader, { state: 'uploading', uploadLeaseToken: token, uploadLeaseUntil: new Date(clock.getTime() + 1), expiresAt: new Date(0) }),
        values(uploader, { state: 'uploading', uploadLeaseToken: token, uploadLeaseUntil: clock }),
        values(uploader, { state: 'uploading', uploadLeaseToken: token, uploadLeaseUntil: new Date(clock.getTime() - 1) }),
        values(uploader, { state: 'uploading', uploadLeaseToken: randomUUID(), uploadLeaseUntil: new Date(clock.getTime() + 1000) }),
        values(uploader, { state: 'pending', uploadLeaseToken: token, uploadLeaseUntil: new Date(clock.getTime() + 1000) }),
        values(uploader, { state: 'uploading', uploadLeaseToken: token }),
      ]
      await Assets.insertMany(rows)
      const originalUpdate = MediaAsset.updateOne
      // Execute the production repository predicate unchanged, routing only its
      // model binding to this isolated real MongoDB connection (not a DB mock).
      MediaAsset.updateOne = (...args) => Assets.updateOne(...args)
      try {
        for (const [index, row] of rows.entries()) {
          const before = await Assets.findById(row._id).select('+state +uploadLeaseToken +uploadLeaseUntil').lean()
          assert.equal(await mediaRepository.refreshLease(row._id, token, clock), index === 0)
          const after = await Assets.findById(row._id).select('+state +uploadLeaseToken +uploadLeaseUntil').lean()
          if (index === 0) {
            assert.equal(after.uploadLeaseUntil.getTime(), clock.getTime() + IMAGE_LIMITS.uploadLeaseMs)
            assert.equal(after.uploadLeaseToken, token)
            assert.equal(after.state, 'uploading')
          } else assert.deepEqual(after, before)
        }
        assert.equal(await mediaRepository.refreshLease(rows[0]._id, token, new Date(clock.getTime() + IMAGE_LIMITS.uploadLeaseMs)), false)
        assert.equal(await mediaRepository.refreshLease(new mongoose.Types.ObjectId(), token, clock), false)
      } finally { MediaAsset.updateOne = originalUpdate }
    })
    await t.test('competing requests cannot reserve beyond ten active slots', async () => {
      const uploader = owner()
      await Assets.insertMany(Array.from({ length: 9 }, () => values(uploader)))
      const attempts = [values(uploader), values(uploader)]
      const results = await Promise.allSettled(attempts.map((value) => reserve(value, clock)))
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
      assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'IMAGE_UPLOAD_QUOTA')
      assert.equal(await Assets.countDocuments({ uploadedBy: uploader }), 10)
    })
    await t.test('expiry/deletion cannot reset daily attempts or bypass stored-image limits', async () => {
      const dailyOwner = owner()
      await Assets.insertMany(Array.from({ length: IMAGE_LIMITS.dailyUploads }, () => values(dailyOwner, { state: 'deleted', expiresAt: new Date(0) })))
      await assert.rejects(reserve(values(dailyOwner), clock), { code: 'IMAGE_UPLOAD_QUOTA' })
      const storageOwner = owner()
      await Assets.insertMany(Array.from({ length: IMAGE_LIMITS.storedImages }, () => values(storageOwner, { expiresAt: new Date(0), createdAt: new Date(clock.getTime() - 172800000) })))
      await assert.rejects(reserve(values(storageOwner), clock), { code: 'IMAGE_RECOVERY_QUOTA' })
    })
    await t.test('dry-run has no mutations/provider calls; recovery failure holds identity/debt; confirmed absence releases it', async () => {
      const uploader = owner(), value = values(uploader, { expiresAt: new Date(clock.getTime() - IMAGE_LIMITS.recoveryGraceMs) })
      await Assets.create(value)
      let calls = 0, unavailable = true
      const storage = { stat: async () => { calls++; if (unavailable) throw new Error('Fixture provider unavailable'); return null }, deleteImage: () => assert.fail('Absent objects are never deleted') }
      const models = { pet: Pets }
      const reconcile = createMediaReconciler({ Assets, models, connection, expectedDatabase: database, now: () => clock, storageFactory: () => storage })
      const before = await Assets.findById(value._id).select('+state +publicId +idempotencyKey +cleanupAttempts').lean()
      assert.equal((await reconcile([String(value._id)])).results[0].outcome, 'would_reconcile')
      assert.equal(calls, 0)
      assert.deepEqual(await Assets.findById(value._id).select('+state +publicId +idempotencyKey +cleanupAttempts').lean(), before)
      assert.equal((await reconcile([String(value._id)], { apply: true })).results[0].outcome, 'recovery_failed')
      const failed = await Assets.findById(value._id).select('+state +publicId +idempotencyKey')
      assert.equal(failed.state, 'delete_pending'); assert.equal(failed.publicId, before.publicId); assert.equal(failed.idempotencyKey, before.idempotencyKey)
      assert.equal((await reconcile([String(value._id)], { apply: true })).results[0].outcome, 'retry_cooldown')
      clock = new Date(clock.getTime() + IMAGE_LIMITS.recoveryGraceMs + 1); unavailable = false
      assert.equal((await reconcile([String(value._id)], { apply: true })).results[0].outcome, 'absent_confirmed')
      assert.equal((await Assets.findById(value._id).select('+state')).state, 'deleted')
      assert.equal((await reconcile([String(value._id)], { apply: true })).results[0].outcome, 'protected_state')
    })
    await t.test('hidden/current content references prevent recovery, regardless of incorrect asset state', async () => {
      const uploader = owner(), image = values(uploader, { expiresAt: new Date(0) })
      await Assets.create(image)
      const pet = await Pets.create({ name: 'Synthetic hidden reference', species: 'Dog', reportedBy: uploader, moderationStatus: 'hidden',
        imageIds: [image._id], photo: `/api/uploads/managed/${image._id}/content`, location: { type: 'Point', coordinates: [114.18, 22.3] } })
      petIds.push(pet._id)
      const reconcile = createMediaReconciler({ Assets, models: { pet: Pets }, connection, expectedDatabase: database, now: () => clock,
        storageFactory: () => assert.fail('Referenced objects must not reach the provider') })
      assert.equal((await reconcile([String(image._id)], { apply: true, allowDelete: true })).results[0].outcome, 'referenced')
      assert.equal((await Assets.findById(image._id).select('+state')).state, 'pending')
    })
  } finally {
    const budgets = await Budgets.find({ user: { $in: owners } }).select('_id').lean()
    await Budgets.deleteMany({ _id: { $in: budgets.map((row) => row._id) } })
    await Assets.deleteMany({ _id: { $in: ids } }); await Pets.deleteMany({ _id: { $in: petIds } })
    assert.equal(await Assets.countDocuments({ _id: { $in: ids } }), 0)
    assert.equal(await Budgets.countDocuments({ user: { $in: owners } }), 0)
    t.diagnostic('Quota/recovery exact synthetic fixture removal verified; provider was mocked; no Atlas access.')
    await connection.close()
  }
})
