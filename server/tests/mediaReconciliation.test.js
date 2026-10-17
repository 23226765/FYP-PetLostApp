import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { createMediaReconciler, recoveryEligibility } from '../services/mediaReconciliation.js'
import { IMAGE_LIMITS } from '../config/imageStorage.js'

const id = () => String(new mongoose.Types.ObjectId())
function fixture() {
  let clock = new Date('2026-10-12T12:00:00Z'), present = true, failStat = false, referenced = false, failWrite = false
  const row = { _id: id(), uploadedBy: id(), state: 'pending', publicId: 'petlostapp/test/pets/12345678-1234-4234-8234-123456789abc',
    provider: 'cloudinary', providerAssetId: 'synthetic-provider-id', expiresAt: new Date(clock.getTime() - IMAGE_LIMITS.recoveryGraceMs), updatedAt: clock }
  const calls = []
  const matches = (query) => Object.entries(query).every(([key, value]) => {
    if (value?.$exists === false) return row[key] === undefined
    if (value?.$gt) return new Date(row[key]) > new Date(value.$gt)
    if (value === null) return row[key] == null
    return String(row[key]) === String(value)
  })
  const q = (get) => ({ select() { return this }, lean: async () => get() })
  const Assets = {
    findById: (key) => q(() => key === row._id ? structuredClone(row) : null),
    findOneAndUpdate: (filter, update) => q(() => {
      if (!matches(filter)) return null
      Object.assign(row, update.$set); row.cleanupAttempts = (row.cleanupAttempts || 0) + 1; row.updatedAt = clock
      calls.push('claim'); return structuredClone(row)
    }),
    exists: async (filter) => matches(filter),
    async updateOne(filter, update) {
      if (failWrite) throw new Error('Isolated write failure')
      if (!matches(filter)) return { matchedCount: 0 }
      calls.push('update'); Object.assign(row, update.$set); row.updatedAt = clock; return { matchedCount: 1 }
    },
  }
  const storage = {
    async stat() { calls.push('stat'); if (failStat) throw new Error('Isolated provider failure'); return present ? { providerAssetId: row.providerAssetId } : null },
    async deleteImage(asset) { assert.equal(asset._id, row._id); assert.equal(asset.publicId, row.publicId); calls.push('delete'); present = false },
  }
  const reconcile = createMediaReconciler({ Assets, models: { pet: { exists: async () => referenced } }, connection: { readyState: 1, name: 'fixture' },
    expectedDatabase: 'fixture', now: () => clock, storageFactory: () => storage })
  return { row, calls, run: (options) => reconcile([row._id], options), reconcile,
    advance: () => { clock = new Date(clock.getTime() + IMAGE_LIMITS.recoveryGraceMs + 1) },
    fail: () => { failStat = true }, recover: () => { failStat = false }, referenced: () => { referenced = true },
    loseWrite: () => { failWrite = true }, get clock() { return clock } }
}

test('reconciliation is dry-run by default and rejects unbounded/ambiguous client identifiers', async () => {
  const f = fixture(), before = structuredClone(f.row)
  assert.equal((await f.run()).results[0].outcome, 'would_reconcile')
  assert.deepEqual(f.calls, []); assert.deepEqual(f.row, before)
  for (const ids of [[], [f.row._id, f.row._id], ['provider-public-id'], Array(26).fill(f.row._id)]) {
    await assert.rejects(f.reconcile(ids), { code: 'IMAGE_REQUEST_INVALID' })
  }
  await assert.rejects(f.run({ allowDelete: true }), { code: 'IMAGE_REQUEST_INVALID' })
})
test('expiry boundaries preserve active leases and grace, including old uploads without leases', () => {
  const f = fixture(), asset = { ...f.row, state: 'uploading', expiresAt: new Date(0), uploadLeaseUntil: new Date(f.clock.getTime() + 1) }
  assert.equal(recoveryEligibility(asset, f.clock), 'active_or_grace')
  asset.uploadLeaseUntil = new Date(f.clock.getTime() - IMAGE_LIMITS.recoveryGraceMs + 1)
  assert.equal(recoveryEligibility(asset, f.clock), 'active_or_grace')
  asset.uploadLeaseUntil = new Date(f.clock.getTime() - IMAGE_LIMITS.recoveryGraceMs)
  assert.equal(recoveryEligibility(asset, f.clock), 'eligible')
  delete asset.uploadLeaseUntil; asset.expiresAt = new Date(f.clock.getTime() + 1)
  assert.equal(recoveryEligibility(asset, f.clock), 'active_or_grace')
  for (const state of ['attached', 'deleted', 'failed']) assert.equal(recoveryEligibility({ ...f.row, state }, f.clock), 'protected_state')
  assert.equal(recoveryEligibility({ ...f.row, failureCode: 'IMAGE_STORAGE_CONFLICT' }, f.clock), 'collision_not_owned')
})
test('provider-present recovery never deletes without an additional exact-delete authorization', async () => {
  const f = fixture()
  assert.equal((await f.run({ apply: true })).results[0].outcome, 'provider_present_delete_not_authorized')
  assert.ok(!f.calls.includes('delete')); assert.equal(f.row.state, 'pending')
  assert.equal((await f.run({ apply: true, allowDelete: true })).results[0].outcome, 'retry_cooldown')
  f.advance()
  assert.equal((await f.run({ apply: true, allowDelete: true })).results[0].outcome, 'deleted_confirmed')
  assert.equal(f.calls.filter((call) => call === 'delete').length, 1)
  assert.equal((await f.run({ apply: true, allowDelete: true })).results[0].outcome, 'protected_state')
})
test('failed recovery retains metadata/debt and failed DB acknowledgement leaves a resumable claim', async () => {
  const f = fixture(), publicId = f.row.publicId
  f.fail(); assert.equal((await f.run({ apply: true, allowDelete: true })).results[0].outcome, 'recovery_failed')
  assert.equal(f.row.state, 'delete_pending'); assert.equal(f.row.publicId, publicId)
  f.advance(); f.recover(); f.loseWrite()
  assert.equal((await f.run({ apply: true, allowDelete: true })).results[0].outcome, 'recovery_failed')
  assert.equal(f.row.state, 'reconciling'); assert.ok(f.row.recoveryToken)
})
test('concurrent requests claim/deallocate one exact object once, and references always protect it', async () => {
  const f = fixture()
  const results = await Promise.all([f.run({ apply: true, allowDelete: true }), f.run({ apply: true, allowDelete: true })])
  assert.equal(results.filter((result) => result.results[0].outcome === 'deleted_confirmed').length, 1)
  assert.equal(f.calls.filter((call) => call === 'delete').length, 1)
  const protectedFixture = fixture(); protectedFixture.referenced()
  assert.equal((await protectedFixture.run({ apply: true, allowDelete: true })).results[0].outcome, 'referenced')
  assert.deepEqual(protectedFixture.calls, [])
})
