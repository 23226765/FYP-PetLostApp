import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { createSightingSubmission } from '../services/sightingSubmission.js'

// Transaction/DB are isolated rollback mocks. This is NOT MongoDB MVCC proof.
function fixture(withImage) {
  const owner = String(new mongoose.Types.ObjectId()), petId = String(new mongoose.Types.ObjectId())
  const reporter = String(new mongoose.Types.ObjectId()), imageId = String(new mongoose.Types.ObjectId())
  const rows = new Map(), asset = { _id: imageId, uploadedBy: reporter, purpose: 'sighting', state: 'pending', expiresAt: new Date(Date.now() + 86400000) }
  let status = 'lost', hidden = false, fail = false, reuniteBeforeWrite = false, creates = 0
  const query = (getter) => ({ select() { return this }, session(session) { assert.ok(session); return this }, then(resolve, reject) { return Promise.resolve().then(getter).then(resolve, reject) } })
  const connection = { readyState: 1, name: 'petlostapp', async startSession() {
    return { async withTransaction(callback) {
      const snapshot = { rows: structuredClone([...rows]), asset: structuredClone(asset), status }
      try { await callback() } catch (error) {
        rows.clear(); snapshot.rows.forEach(([key, value]) => rows.set(key, value))
        Object.keys(asset).forEach((key) => delete asset[key]); Object.assign(asset, snapshot.asset)
        // The simulated independent owner's write survives our rollback.
        if (!reuniteBeforeWrite) status = snapshot.status
        throw error
      }
    }, async endSession() {} }
  } }
  class Sightings {
    static db = connection
    constructor(value) { Object.assign(this, value) }
    set(values) { Object.assign(this, values) }
    async save({ session }) {
      assert.ok(session)
      if (fail) throw new Error('Fixture write failed')
      rows.set(String(this._id), { ...this }); creates++
    }
    static findOne(filter) { return query(() => {
      const row = [...rows.values()].find((r) => Object.entries(filter).every(([k, v]) => String(r[k]) === String(v)))
      return row ? new Sightings(row) : null
    }) }
  }
  const Pets = {
    findOne: () => query(() => hidden ? null : { _id: petId, reportedBy: owner, status }),
    async updateOne(filter, update, { session }) {
      assert.ok(session); assert.deepEqual(filter.status, { $in: ['lost', 'sighted'] })
      assert.equal(update.$inc.__v, 1, 'Already-sighted parents must still receive a real transactional write')
      assert.deepEqual(filter.moderationStatus, { $ne: 'hidden' })
      if (reuniteBeforeWrite) status = 'reunited'
      if (hidden || !filter.status.$in.includes(status)) return { matchedCount: 0 }
      status = update.$set.status; return { matchedCount: 1 }
    },
  }
  const Assets = {
    find: () => query(() => [asset]),
    async updateOne(_filter, update, { session }) { assert.ok(session); Object.assign(asset, update.$set); return { matchedCount: 1 } },
  }
  const submit = createSightingSubmission({ Pets, Sightings })
  const input = { petId, userId: reporter, imageIds: withImage ? [imageId] : [], submissionId: 'fixture_sighting_001',
    values: { pet: petId, reportedBy: reporter, submissionId: 'fixture_sighting_001', note: 'Fixture', photo: '' } }
  return { rows, asset, submit: () => submit(input, { Assets, connection }), get status() { return status }, get creates() { return creates },
    close: () => { status = 'reunited' }, race: () => { reuniteBeforeWrite = true }, fail: () => { fail = true }, hide: () => { hidden = true } }
}

for (const withImage of [false, true]) {
  const label = withImage ? 'managed image' : 'photo-free'
  test(`${label}: one creation/status change; duplicate retries cannot reopen a reunited pet`, async () => {
    const f = fixture(withImage), first = await f.submit()
    assert.equal(f.status, 'sighted'); assert.equal(f.rows.size, 1)
    const again = await f.submit()
    assert.equal(again.duplicate, true); assert.equal(String(again.doc._id), String(first.doc._id)); assert.equal(f.creates, 1)
    f.close(); await f.submit(); assert.equal(f.status, 'reunited')
  })
  test(`${label}: concurrent owner reunion rejects creation without overwriting owner status`, async () => {
    const f = fixture(withImage); f.race()
    await assert.rejects(f.submit(), { status: 409, code: 'PET_NOT_ACCEPTING_SIGHTINGS' })
    assert.equal(f.status, 'reunited'); assert.equal(f.rows.size, 0); assert.equal(f.asset.state, 'pending')
  })
  test(`${label}: content-write failure rolls back status, sighting and asset claims`, async () => {
    const f = fixture(withImage); f.fail()
    await assert.rejects(f.submit(), { code: 'IMAGE_DATABASE_UNAVAILABLE' })
    assert.equal(f.status, 'lost'); assert.equal(f.rows.size, 0); assert.equal(f.asset.state, 'pending')
  })
  test(`${label}: hidden parent is unavailable and ordinary creation cannot bypass moderation`, async () => {
    const f = fixture(withImage); f.hide()
    await assert.rejects(f.submit(), { status: 404, code: 'PET_NOT_FOUND' })
    assert.equal(f.rows.size, 0); assert.equal(f.asset.state, 'pending')
  })
}
