import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import Message from '../models/Message.js'
import SavedStray from '../models/SavedStray.js'
import Stray from '../models/Stray.js'
import StrayComment from '../models/StrayComment.js'
import { createComment, reportStray } from '../controllers/strayController.js'

function responseRecorder() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this }, json(payload) { this.payload = payload; return this } }
}

test('stray schema preserves GeoJSON and adds community post fields', () => {
  assert.equal(Stray.schema.path('location.coordinates').isRequired, true)
  assert.ok(Stray.schema.indexes().some(([fields]) => fields.location === '2dsphere'))
  for (const field of ['photos', 'observedAt', 'active', 'submissionId']) assert.ok(Stray.schema.path(field))
})

test('comments and private saves use ownership indexes', () => {
  assert.ok(StrayComment.schema.indexes().some(([fields]) => fields.stray === 1 && fields.createdAt === -1))
  const uniqueSave = SavedStray.schema.indexes().find(([fields]) => fields.user === 1 && fields.stray === 1)
  assert.equal(uniqueSave?.[1]?.unique, true)
  assert.ok(Message.schema.path('sharedStray'))
})

test('new stray posts reject absent selected coordinates and uploaded photo URLs', async () => {
  const res = responseRecorder()
  await reportStray({ user: { _id: new mongoose.Types.ObjectId(), name: 'Test', phone: '' }, body: { species: 'Dog', description: 'Seen nearby', condition: 'healthy', district: 'Sha Tin', locationName: 'Park', submissionId: 'one' } }, res, (error) => { throw error })
  assert.equal(res.statusCode, 400)
  assert.match(res.payload.error, /coordinates/)

  const dataResponse = responseRecorder()
  await reportStray({ user: { _id: new mongoose.Types.ObjectId(), name: 'Test', phone: '' }, body: { species: 'Dog', description: 'Seen nearby', photos: ['data:image/png;base64,AAAA'], condition: 'healthy', district: 'Sha Tin', locationName: 'Park', coordinates: [114.18, 22.3], submissionId: 'two' } }, dataResponse, (error) => { throw error })
  assert.equal(dataResponse.statusCode, 400)
  assert.match(dataResponse.payload.error, /photo URL/)
})

test('empty and oversized comments are rejected before database access', async () => {
  for (const text of ['', 'x'.repeat(501)]) {
    const res = responseRecorder()
    await createComment({ params: { id: new mongoose.Types.ObjectId().toString() }, user: { _id: new mongoose.Types.ObjectId() }, body: { text, submissionId: 'comment-one' } }, res, (error) => { throw error })
    assert.equal(res.statusCode, 400)
  }
})
