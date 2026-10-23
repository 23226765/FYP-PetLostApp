import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import express from 'express'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { openTransactionDatabase } from './helpers/localTransactions.js'

const uri = process.env.MEDIA_TEST_MONGODB_URI
test('real rescue routes reject stale edit eligibility before and during image transactions', {
  skip: !uri ? 'Dedicated local replica set required; application databases prohibited.' : false,
  timeout: 120000,
}, async t => {
  const { connection, database } = await openTransactionDatabase(uri, 'rescue', t)
  const models = {}, ledger = new Map()
  const secret = randomBytes(48).toString('base64url'), oldSecret = process.env.JWT_SECRET
  const providerDeletes = []
  let server, gate
  process.env.JWT_SECRET = secret
  mongoose.set('autoCreate', false); mongoose.set('autoIndex', false)
  const create = async (Model, values) => {
    const id = values._id || new mongoose.Types.ObjectId()
    ledger.get(Model).push(id)
    return Model.create({ ...values, _id: id })
  }
  try {
    // Same injection boundary as the existing provider harness: only the expected
    // disposable DB name and storage adapter change. Routes, auth, controllers,
    // sessions and MongoDB commits/rollbacks execute their actual implementations.
    t.mock.module(new URL('../config/database.js', import.meta.url).href, { namedExports: { DATABASE_NAME: database } })
    t.mock.module(new URL('../services/storage/index.js', import.meta.url).href, {
      namedExports: { createImageStorage: () => ({ async deleteImage(asset) { providerDeletes.push(String(asset._id)) } }) },
    })
    for (const name of ['User', 'Stray', 'StrayComment', 'UserBlock', 'SavedStray', 'MediaAsset', 'Notification']) {
      const Original = (await import(`../models/${name}.js`)).default
      const Model = connection.model(name, Original.schema.clone())
      models[name] = Model; ledger.set(Model, [])
      await Model.createCollection(); await Model.createIndexes()
      t.mock.module(new URL(`../models/${name}.js`, import.meta.url).href, { defaultExport: Model })
    }
    const { User, Stray, MediaAsset } = models
    const actors = []
    for (const role of ['user', 'user', 'shelter_admin']) {
      actors.push(await create(User, { name: 'Synthetic rescue edit', email: `${randomUUID()}@example.test`, password: randomUUID(), role }))
    }
    const [owner, unrelated, admin] = actors
    const app = express(); app.use(express.json())
    app.use('/api/strays', (await import('../routes/strays.js')).default)
    app.use((await import('../middleware/errorHandler.js')).errorHandler)
    server = app.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))
    const base = `http://127.0.0.1:${server.address().port}/api/strays`
    const request = (id, actor, method, body) => fetch(`${base}/${id}`, {
      method, headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${jwt.sign({ id: String(actor._id) }, secret)}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    async function fixture() {
      const postId = new mongoose.Types.ObjectId()
      const asset = (attached) => create(MediaAsset, {
        provider: 'cloudinary', publicId: `petlostapp/test/synthetic/${randomUUID()}`, providerAssetId: randomUUID(),
        secureUrl: 'https://res.cloudinary.com/fictional/image/authenticated/fixture.webp',
        uploadedBy: owner._id, purpose: 'stray', state: attached ? 'attached' : 'pending',
        ...(attached ? { attachedTo: { type: 'stray', id: postId } } : {}),
        width: 8, height: 8, bytes: 80, format: 'webp', checksum: 'a'.repeat(64),
        idempotencyKey: randomUUID(), expiresAt: new Date(Date.now() + 86400000),
      })
      const old = await asset(true), pending = await asset(false)
      const photo = `/api/uploads/managed/${old._id}/content`
      const post = await create(Stray, {
        _id: postId, species: 'Dog', description: 'Original synthetic description', district: 'Sha Tin',
        locationName: 'Synthetic', location: { type: 'Point', coordinates: [114.17, 22.3] },
        reporterName: owner.name, reportedBy: owner._id, active: true, photo, photos: [photo], imageIds: [old._id],
      })
      return { post, old, pending }
    }
    // Pause after real reads, never replace their results or simulate rollback.
    const exec = Stray.Query.prototype.exec
    t.mock.method(Stray.Query.prototype, 'exec', async function (...args) {
      const result = await exec.apply(this, args)
      if (gate && this.op === 'findOne' && String(this.getFilter()._id) === gate.id) {
        if (this.getOptions().session) gate.transactionReads++
        if (gate.phase === 'preflight' && !this.getOptions().session && !gate.reached) {
          gate.reached = true; gate.ready(); await gate.wait
        }
      }
      return result
    })
    const save = Stray.prototype.save
    t.mock.method(Stray.prototype, 'save', async function (options) {
      if (gate?.phase === 'snapshot' && String(this._id) === gate.id && options?.session?.inTransaction() && !gate.reached) {
        assert.ok(this.isModified('imageIds'), 'Destination must write even for an identical edit')
        gate.reached = true; gate.ready(); await gate.wait
      }
      return save.call(this, options)
    })
    for (const [phase, mutation, identical, withImage] of [
      ['preflight', 'deactivate', false, true], ['snapshot', 'deactivate', false, true],
      ['snapshot', 'deactivate', true, true], ['preflight', 'deactivate', false, false],
      ['snapshot', 'hide', false, true], ['snapshot', 'owner-change', false, true],
    ]) {
      await t.test(`${phase}: ${mutation}, ${identical ? 'identical' : 'changed'} ${withImage ? 'image' : 'text-only'} edit`, async () => {
        const { post, old, pending } = await fixture()
        const beforeAssets = await MediaAsset.collection.find({ _id: { $in: [old._id, pending._id] } }).sort({ _id: 1 }).toArray()
        const deletesBefore = providerDeletes.length
        let ready, release
        const reached = new Promise(resolve => { ready = resolve })
        const wait = new Promise(resolve => { release = resolve })
        gate = { id: String(post._id), phase, ready, wait, release, reached: false, transactionReads: 0 }
        const edit = request(post._id, owner, 'PATCH', {
          description: identical ? post.description : 'Must never be saved',
          ...(withImage ? { imageIds: [String(identical ? old._id : pending._id)] } : {}),
        })
        try {
          await Promise.race([reached, edit.then(response => { throw new Error(`Edit bypassed concurrency barrier (${response.status})`) })])
          if (mutation === 'deactivate') assert.equal((await request(post._id, owner, 'DELETE')).status, 200)
          else await Stray.updateOne({ _id: post._id }, { $set: mutation === 'hide' ? { moderationStatus: 'hidden' } : { reportedBy: unrelated._id } })
        } finally { release() }
        const response = await edit
        assert.equal(response.status, mutation === 'owner-change' ? 403 : 404)
        if (phase === 'snapshot') assert.ok(gate.transactionReads >= 2, 'Actual MongoDB conflict must retry transactional eligibility')
        gate = null
        const after = await Stray.findById(post._id).select('+imageIds')
        assert.equal(after.description, post.description)
        assert.deepEqual(after.imageIds.map(String), [String(old._id)])
        assert.equal(after.photo, post.photo); assert.deepEqual(after.photos, post.photos)
        if (mutation === 'deactivate') assert.equal(after.active, false)
        assert.deepEqual(await MediaAsset.collection.find({ _id: { $in: [old._id, pending._id] } }).sort({ _id: 1 }).toArray(), beforeAssets)
        assert.equal(providerDeletes.length, deletesBefore)
      })
    }
    await t.test('route authorization and successful eligible replacement retain the existing policy', async () => {
      const { post, old, pending } = await fixture()
      const body = { description: 'Successful synthetic edit', imageIds: [String(pending._id)] }
      for (const [actor, expected] of [[null, 401], [unrelated, 403], [admin, 403]]) {
        assert.equal((await request(post._id, actor, 'PATCH', body)).status, expected)
      }
      const response = await request(post._id, owner, 'PATCH', body)
      assert.equal(response.status, 200)
      assert.equal((await response.json()).stray.description, body.description)
      assert.equal((await Stray.findById(post._id)).description, body.description)
      assert.equal((await MediaAsset.findById(pending._id).select('+state')).state, 'attached')
      assert.equal((await MediaAsset.findById(old._id).select('+state')).state, 'deleted')
      assert.deepEqual(providerDeletes, [String(old._id)])
    })
  } finally {
    gate?.release()
    if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections() })
    for (const [Model, ids] of ledger) {
      await Model.deleteMany({ _id: { $in: ids } })
      assert.equal(await Model.countDocuments({ _id: { $in: ids } }), 0)
    }
    await connection.close()
    if (oldSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = oldSecret
    t.diagnostic('Actual HTTP/controllers/local transactions; provider mocked. Exact fixtures removed; no Atlas/provider access.')
  }
})
