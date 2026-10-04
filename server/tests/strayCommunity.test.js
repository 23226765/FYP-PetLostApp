import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import Message from '../models/Message.js'
import SavedStray from '../models/SavedStray.js'
import Stray from '../models/Stray.js'
import StrayComment from '../models/StrayComment.js'
import User from '../models/User.js'
import UserBlock from '../models/UserBlock.js'
import { createComment, getStray, listMyStrays, listSavedStrays, reportStray } from '../controllers/strayController.js'

const originalUserBlockFind = UserBlock.find
before(() => { UserBlock.find = () => ({ select: async () => [] }) })
after(() => { UserBlock.find = originalUserBlockFind })

function responseRecorder() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this }, json(payload) { this.payload = payload; return this } }
}

function strayRecord(overrides = {}) {
  const reporterId = new mongoose.Types.ObjectId()
  return {
    _id: new mongoose.Types.ObjectId(), species: 'Dog', animalType: '', description: 'Waiting safely',
    photo: 'https://example.test/stray.jpg', photos: ['https://example.test/stray.jpg'],
    condition: 'healthy', district: 'Sha Tin', locationName: 'Sha Tin Park',
    location: { type: 'Point', coordinates: [114.18, 22.38] }, rescueStatus: 'reported',
    reporterName: 'FYP Finder', reporterPhone: '+852 5555 0102', reportedBy: reporterId,
    observedAt: new Date('2026-09-20T10:00:00.000Z'), createdAt: new Date('2026-09-20T10:00:00.000Z'),
    updatedAt: new Date('2026-09-20T10:00:00.000Z'), statusUpdatedAt: new Date('2026-09-20T10:00:00.000Z'),
    active: true, ...overrides,
  }
}

test('authored rescue posts are ownership-scoped, paginated, and contact-free', async () => {
  const originals = { find: Stray.find, count: Stray.countDocuments, userFind: User.find, aggregate: StrayComment.aggregate, saveFind: SavedStray.find }
  const userId = new mongoose.Types.ObjectId(); const record = strayRecord({ reportedBy: userId }); let authorSelection = ''
  try {
    Stray.countDocuments = async (filter) => {
      assert.equal(String(filter.reportedBy), String(userId))
      assert.deepEqual(filter.moderationStatus, { $ne: 'hidden' })
      return 1
    }
    Stray.find = (filter) => {
      assert.equal(String(filter.reportedBy), String(userId))
      assert.deepEqual(filter.moderationStatus, { $ne: 'hidden' })
      return { sort() { return this }, skip(value) { assert.equal(value, 0); return this }, limit(value) { assert.equal(value, 10); return Promise.resolve([record]) } }
    }
    User.find = () => ({ select: async (selection) => { authorSelection = selection; return [{ _id: userId, name: 'FYP Finder', avatar: '', phone: '+852 5555 0102' }] } })
    StrayComment.aggregate = async (pipeline) => {
      assert.deepEqual(pipeline[0].$match.moderationStatus, { $ne: 'hidden' })
      return []
    }
    SavedStray.find = () => ({ select: async () => [] })
    const response = responseRecorder()
    await listMyStrays({ user: { _id: userId }, query: { page: '1', limit: '10', userId: new mongoose.Types.ObjectId().toString() } }, response, (error) => { throw error })
    assert.equal(response.payload.strays.length, 1)
    assert.equal(response.payload.pagination.total, 1)
    assert.equal(authorSelection.includes('phone'), false)
    assert.equal('reporterPhone' in response.payload.strays[0], false)
    assert.equal(response.payload.strays[0].canViewContact, false)
  } finally {
    Stray.find = originals.find; Stray.countDocuments = originals.count; User.find = originals.userFind
    StrayComment.aggregate = originals.aggregate; SavedStray.find = originals.saveFind
  }
})

test('rescue location is exact only for its author and forced-public output stays approximate', async () => {
  const originals = {
    strayFindOne: Stray.findOne,
    userFind: User.find,
    commentAggregate: StrayComment.aggregate,
    savedFind: SavedStray.find,
  }
  const authorId = new mongoose.Types.ObjectId()
  const record = strayRecord({ reportedBy: authorId })

  try {
    Stray.findOne = async () => record
    User.find = () => ({
      select: async () => [{
        _id: authorId,
        name: 'FYP Finder',
        avatar: '',
        phone: '+852 5555 0102',
        privacy: { contactVisibility: 'authenticated' },
      }],
    })
    StrayComment.aggregate = async () => []
    SavedStray.find = () => ({ select: async () => [] })

    const scenarios = [
      { label: 'guest', user: undefined, precision: 'approximate' },
      { label: 'unrelated', user: { _id: new mongoose.Types.ObjectId() }, precision: 'approximate' },
      {
        label: 'shelter admin',
        user: { _id: new mongoose.Types.ObjectId(), role: 'shelter_admin' },
        precision: 'approximate',
      },
      { label: 'author', user: { _id: authorId }, precision: 'exact' },
    ]

    for (const scenario of scenarios) {
      const response = responseRecorder()
      await getStray(
        { params: { id: String(record._id) }, query: {}, user: scenario.user },
        response,
        (error) => { throw error },
      )
      const serialized = response.payload.stray
      assert.equal(serialized.locationPrecision, scenario.precision, scenario.label)
      if (scenario.precision === 'exact') {
        assert.equal(serialized.location, 'Sha Tin Park')
        assert.deepEqual(serialized.coordinates, [114.18, 22.38])
      } else {
        assert.equal(serialized.location, 'Sha Tin')
        assert.notDeepEqual(serialized.coordinates, [114.18, 22.38])
      }
    }

    const publicResponse = responseRecorder()
    await getStray(
      {
        params: { id: String(record._id) },
        query: { view: 'public' },
        user: { _id: authorId },
      },
      publicResponse,
      (error) => { throw error },
    )
    assert.equal(publicResponse.payload.stray.locationPrecision, 'approximate')
    assert.equal(publicResponse.payload.stray.location, 'Sha Tin')
    assert.equal(publicResponse.payload.stray.canViewContact, false)
    assert.equal('reporterPhone' in publicResponse.payload.stray, false)
  } finally {
    Stray.findOne = originals.strayFindOne
    User.find = originals.userFind
    StrayComment.aggregate = originals.commentAggregate
    SavedStray.find = originals.savedFind
  }
})

test('saved rescue posts use only the authenticated user and skip unavailable posts safely', async () => {
  const originals = { strayFind: Stray.find, saveFind: SavedStray.find, saveCount: SavedStray.countDocuments, userFind: User.find, aggregate: StrayComment.aggregate }
  const userId = new mongoose.Types.ObjectId(); const available = strayRecord(); const missingId = new mongoose.Types.ObjectId()
  const saves = [{ stray: available._id }, { stray: missingId }]
  try {
    SavedStray.countDocuments = async (filter) => { assert.equal(String(filter.user), String(userId)); return 2 }
    SavedStray.find = (filter) => {
      if (filter.stray) return { select: async () => [] }
      assert.equal(String(filter.user), String(userId))
      return { sort() { return this }, skip() { return this }, limit() { return Promise.resolve(saves) } }
    }
    Stray.find = async (filter) => {
      assert.deepEqual(filter.moderationStatus, { $ne: 'hidden' })
      return [available]
    }
    User.find = () => ({ select: async (selection) => { assert.equal(selection.includes('phone'), false); return [{ _id: available.reportedBy, name: 'Reporter', avatar: '' }] } })
    StrayComment.aggregate = async () => []
    const response = responseRecorder()
    await listSavedStrays({ user: { _id: userId }, query: { page: '1', limit: '20', userId: 'someone-else' } }, response, (error) => { throw error })
    assert.deepEqual(response.payload.strays.map((post) => post.id), [String(available._id)])
    assert.equal(response.payload.unavailableCount, 1)
    assert.equal(response.payload.pagination.total, 2)
    assert.equal('reporterPhone' in response.payload.strays[0], false)
  } finally {
    Stray.find = originals.strayFind; SavedStray.find = originals.saveFind; SavedStray.countDocuments = originals.saveCount
    User.find = originals.userFind; StrayComment.aggregate = originals.aggregate
  }
})

test('stray schema preserves GeoJSON and adds community post fields', () => {
  assert.equal(Stray.schema.path('location.coordinates').isRequired, true)
  assert.ok(Stray.schema.indexes().some(([fields]) => fields.location === '2dsphere'))
  for (const field of ['animalType', 'photos', 'observedAt', 'active', 'submissionId']) assert.ok(Stray.schema.path(field))
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

test('Other stray reports require a specific animal type before database access', async () => {
  const res = responseRecorder()
  await reportStray({
    user: { _id: new mongoose.Types.ObjectId(), name: 'Test', phone: '' },
    body: { species: 'Other', description: 'Seen nearby', photos: ['https://example.test/animal.jpg'], condition: 'healthy', district: 'Sha Tin', locationName: 'Park', coordinates: [114.18, 22.3], submissionId: 'other-one' },
  }, res, (error) => { throw error })
  assert.equal(res.statusCode, 400)
  assert.match(res.payload.error, /specify what type of animal/i)
})

test('empty and oversized comments are rejected before database access', async () => {
  for (const text of ['', 'x'.repeat(501)]) {
    const res = responseRecorder()
    await createComment({ params: { id: new mongoose.Types.ObjectId().toString() }, user: { _id: new mongoose.Types.ObjectId() }, body: { text, submissionId: 'comment-one' } }, res, (error) => { throw error })
    assert.equal(res.statusCode, 400)
  }
})
