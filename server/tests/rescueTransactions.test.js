import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import User from '../models/User.js'
import Stray from '../models/Stray.js'
import StrayComment from '../models/StrayComment.js'
import UserBlock from '../models/UserBlock.js'
import SavedStray from '../models/SavedStray.js'
import Pet from '../models/Pet.js'
import Message from '../models/Message.js'
import Notification from '../models/Notification.js'
import { createComment, getStray, listComments, updateStray, deleteStray, updateRescueStatus } from '../controllers/strayController.js'
import { createMessage } from '../controllers/chatController.js'
import { openTransactionDatabase } from './helpers/localTransactions.js'

const uri = process.env.MEDIA_TEST_MONGODB_URI
test('real local rescue permissions, visible comment totals and submission races', {
  skip: !uri ? 'Dedicated local replica set required; application databases are prohibited.' : false, timeout: 120000,
}, async (t) => {
  const { connection } = await openTransactionDatabase(uri, 'rescue', t)
  const originals = [], models = new Map(), ledger = new Map()
  const globals = [User, Stray, StrayComment, UserBlock, SavedStray, Pet, Message, Notification]
  const actorIds = []
  const create = async (Global, values) => {
    const row = await models.get(Global).create(values); ledger.get(Global).push(row._id); return row
  }
  const invoke = async (handler, req) => {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this }, json(body) { this.body = body; return this } }
    await handler({ query: {}, ...req }, res, error => { throw error })
    return res
  }
  try {
    for (const Global of globals) {
      const Local = connection.model(Global.modelName, Global.schema.clone())
      models.set(Global, Local); ledger.set(Global, [])
      await Local.createCollection(); await Local.createIndexes()
      for (const method of ['find', 'findOne', 'findOneAndUpdate', 'findById', 'exists', 'countDocuments', 'aggregate']) {
        const original = Global[method]; originals.push(() => { Global[method] = original })
        Global[method] = (...args) => Local[method](...args)
      }
    }
    const actors = []
    for (const role of ['user', 'user', 'user', 'shelter_admin']) {
      const user = await create(User, { name: 'Synthetic rescue fixture', email: `${randomUUID()}@example.test`, password: randomUUID(), role })
      actors.push(user); actorIds.push(user._id)
    }
    const [owner, finder, blocked, admin] = actors
    const postValues = { species: 'Dog', description: 'Synthetic rescue fixture', photo: 'https://example.test/fixture.jpg',
      photos: ['https://example.test/fixture.jpg'], district: 'Sha Tin', locationName: 'Fictional park',
      location: { type: 'Point', coordinates: [114.18, 22.3] }, reportedBy: owner._id, reporterName: owner.name }
    const post = await create(Stray, postValues), other = await create(Stray, postValues)
    await create(UserBlock, { blocker: blocked._id, blocked: owner._id }) // Reverse-direction block.
    for (let index = 0; index < 58; index++) {
      await create(StrayComment, { stray: post._id, author: index >= 55 && index < 57 ? blocked._id : owner._id,
        text: `Fictional comment ${index}`, ...(index === 57 ? { moderationStatus: 'hidden' } : {}),
        createdAt: new Date(Date.UTC(2026, 9, 1, 0, index)) })
    }
    await t.test('author, shelter, unrelated and guest projections match ordinary mutation permissions', async () => {
      for (const [user, edit, status] of [[owner, true, true], [admin, false, true], [finder, false, false], [undefined, false, false]]) {
        const res = await invoke(getStray, { params: { id: String(post._id) }, user })
        assert.equal(res.body.stray.canEdit, edit); assert.equal(res.body.stray.canDelete, edit)
        assert.equal(res.body.stray.canManage, edit); assert.equal(res.body.stray.canUpdateStatus, status)
      }
      for (const handler of [updateStray, deleteStray]) {
        const res = await invoke(handler, { params: { id: String(post._id) }, user: admin, body: { description: 'Not permitted' } })
        assert.equal(res.statusCode, 403)
      }
      assert.equal((await invoke(updateRescueStatus, { params: { id: String(post._id) }, user: admin, body: { status: 'rescued' } })).statusCode, 200)
      assert.equal((await invoke(updateRescueStatus, { params: { id: String(post._id) }, user: finder, body: { status: 'reported' } })).statusCode, 403)
      const publicView = await invoke(getStray, { params: { id: String(post._id) }, user: owner, query: { view: 'public' } })
      assert.equal(publicView.body.stray.canEdit, false); assert.equal(publicView.body.stray.canUpdateStatus, false)
    })
    await t.test('real aggregate preview/count and paginated rows share hidden/mutual-block filtering', async () => {
      for (const [user, total] of [[owner, 55], [undefined, 57]]) {
        const detail = await invoke(getStray, { params: { id: String(post._id) }, user })
        const page = await invoke(listComments, { params: { id: String(post._id) }, user, query: { page: '2', limit: '10' } })
        assert.equal(detail.body.stray.commentCount, total)
        assert.equal(page.body.pagination.total, total); assert.equal(page.body.comments.length, 10)
        assert.equal(page.body.pagination.hasMore, true)
        assert.equal(detail.body.stray.commentPreview, `Fictional comment ${user ? 54 : 56}`)
        if (user) assert.ok(page.body.comments.every(row => row.author.id !== String(blocked._id)))
      }
    })
    await t.test('identical concurrent comments create one row; changed target/text and hidden replay are denied', async () => {
      const submissionId = randomUUID(), request = { params: { id: String(post._id) }, user: owner, body: { text: 'One new comment', submissionId } }
      const results = await Promise.all([invoke(createComment, request), invoke(createComment, request)])
      assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 201])
      assert.equal(results[0].body.comment.id, results[1].body.comment.id)
      assert.equal(await models.get(StrayComment).countDocuments({ author: owner._id, submissionId }), 1)
      const before = await models.get(StrayComment).findOne({ author: owner._id, submissionId }).lean()
      for (const changed of [{ ...request, params: { id: String(other._id) } }, { ...request, body: { ...request.body, text: 'Different' } }]) {
        await assert.rejects(invoke(createComment, changed), { code: 'SUBMISSION_CONFLICT', status: 409 })
      }
      assert.deepEqual(await models.get(StrayComment).findOne({ author: owner._id, submissionId }).lean(), before)
      await models.get(StrayComment).updateOne({ author: owner._id, submissionId }, { $set: { text: 'An explicitly edited comment' } })
      await assert.rejects(invoke(createComment, request), { code: 'SUBMISSION_CONFLICT', status: 409 })
      assert.equal((await models.get(StrayComment).findOne({ author: owner._id, submissionId })).text, 'An explicitly edited comment')
      await models.get(StrayComment).updateOne({ author: owner._id, submissionId }, { $set: { moderationStatus: 'hidden' } })
      await assert.rejects(invoke(createComment, request), { status: 404 })
      const conflictId = randomUUID()
      const racing = await Promise.allSettled(['First', 'Second'].map(text => invoke(createComment, { ...request, body: { text, submissionId: conflictId } })))
      assert.equal(racing.filter(r => r.status === 'fulfilled').length, 1)
      assert.equal(racing.find(r => r.status === 'rejected').reason.code, 'SUBMISSION_CONFLICT')
      assert.equal(await models.get(StrayComment).countDocuments({ author: owner._id, submissionId: conflictId }), 1)
    })
    await t.test('ordinary chat concurrency binds destination, text, shared-post payload and empty-image state', async () => {
      const pet = await create(Pet, { name: 'Synthetic pet', species: 'Dog', reportedBy: owner._id, location: postValues.location })
      const otherPet = await create(Pet, { name: 'Other synthetic pet', species: 'Dog', reportedBy: owner._id, location: postValues.location })
      const request = { params: { petId: String(pet._id) }, user: finder, body: { text: 'One message', clientRequestId: randomUUID() } }
      const results = await Promise.all([invoke(createMessage, request), invoke(createMessage, request)])
      assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 201])
      assert.equal(results[0].body.message.id, results[1].body.message.id)
      for (const changed of [{ ...request, body: { ...request.body, text: 'Changed' } },
        { ...request, body: { ...request.body, sharedStrayId: String(post._id) } }, { ...request, params: { petId: String(otherPet._id) } }]) {
        await assert.rejects(invoke(createMessage, changed), { code: 'SUBMISSION_CONFLICT', status: 409 })
      }
      assert.equal(await models.get(Message).countDocuments({ sentBy: finder._id, clientRequestId: request.body.clientRequestId }), 1)
    })
  } finally {
    for (const [Global, filter] of [[StrayComment, { author: { $in: actorIds } }], [Message, { sentBy: { $in: actorIds } }], [Notification, { user: { $in: actorIds } }]]) {
      const Local = models.get(Global)
      if (Local) ledger.get(Global).push(...(await Local.find(filter).select('_id').lean()).map(row => row._id))
    }
    for (const [Global, Local] of models) {
      const ids = ledger.get(Global)
      await Local.deleteMany({ _id: { $in: ids } }); assert.equal(await Local.countDocuments({ _id: { $in: ids } }), 0)
    }
    originals.reverse().forEach(restore => restore())
    await connection.close()
    t.diagnostic('Exact isolated rescue fixture cleanup verified; no provider or Atlas access.')
  }
})
