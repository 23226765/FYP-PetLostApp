import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import ContentReport from '../models/ContentReport.js'
import UserBlock from '../models/UserBlock.js'
import User from '../models/User.js'
import Pet from '../models/Pet.js'
import Message from '../models/Message.js'
import Stray from '../models/Stray.js'
import StrayComment from '../models/StrayComment.js'
import Notification from '../models/Notification.js'
import { createContentReport, blockUser, listBlockedUsers, unblockUser } from '../controllers/safetyController.js'
import { getMessages } from '../controllers/chatController.js'
import { createComment, listComments } from '../controllers/strayController.js'
import { getPet } from '../controllers/petController.js'
import { listNotifications } from '../controllers/notificationController.js'

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    headers: {},
    status(code) { this.statusCode = code; return this },
    set(name, value) { this.headers[name] = value; return this },
    json(payload) { this.payload = payload; return this },
  }
}

function failOnNext(error) { throw error }

test('trust and safety models use private batch markers and ownership indexes', () => {
  assert.equal(ContentReport.collection.name, 'contentreports')
  assert.equal(UserBlock.collection.name, 'userblocks')
  for (const model of [ContentReport, UserBlock]) {
    assert.equal(model.schema.options.timestamps, true)
    assert.equal(model.schema.path('seedBatch').options.select, false)
    assert.equal(model.schema.path('seedBatch').options.immutable, true)
  }
  assert.ok(ContentReport.schema.indexes().some(([fields, options]) => fields.reporter === 1 && fields.targetType === 1 && fields.targetId === 1 && options.unique))
  assert.ok(UserBlock.schema.indexes().some(([fields, options]) => fields.blocker === 1 && fields.blocked === 1 && options.unique))
})

test('content reporting is idempotent and never returns private moderation fields', async () => {
  const originals = {
    petFindOne: Pet.findOne,
    reportExists: ContentReport.exists,
    reportUpsert: ContentReport.findOneAndUpdate,
  }
  const reporterId = new mongoose.Types.ObjectId()
  const ownerId = new mongoose.Types.ObjectId()
  const petId = new mongoose.Types.ObjectId()
  const reportId = new mongoose.Types.ObjectId()
  let upsertFilter
  try {
    Pet.findOne = () => ({ select: async () => ({ _id: petId, reportedBy: ownerId }) })
    ContentReport.exists = async () => null
    ContentReport.findOneAndUpdate = async (filter, update, options) => {
      upsertFilter = filter
      assert.equal(options.upsert, true)
      assert.equal(String(update.$setOnInsert.targetOwner), String(ownerId))
      return { _id: reportId, ...filter, reason: 'scam', status: 'pending', createdAt: new Date('2026-09-26T10:00:00Z') }
    }
    const res = responseRecorder()
    await createContentReport({ user: { _id: reporterId }, body: { targetType: 'pet', targetId: String(petId), reason: 'scam', details: 'Suspicious contact request' } }, res, failOnNext)
    assert.equal(res.statusCode, 201)
    assert.equal(String(upsertFilter.reporter), String(reporterId))
    assert.equal(res.payload.report.targetId, String(petId))
    assert.equal(res.payload.report.duplicate, false)
    assert.equal('reporter' in res.payload.report, false)
    assert.equal('targetOwner' in res.payload.report, false)
    assert.equal('details' in res.payload.report, false)
  } finally {
    Pet.findOne = originals.petFindOne
    ContentReport.exists = originals.reportExists
    ContentReport.findOneAndUpdate = originals.reportUpsert
  }
})

test('content reporting rejects unexpected fields and self-reporting', async () => {
  const invalid = responseRecorder()
  await createContentReport({ user: { _id: new mongoose.Types.ObjectId() }, body: { targetType: 'pet', targetId: new mongoose.Types.ObjectId().toString(), reason: 'spam', status: 'actioned' } }, invalid, failOnNext)
  assert.equal(invalid.statusCode, 400)
  assert.equal(invalid.payload.code, 'INVALID_REPORT_BODY')

  const originalFindOne = Pet.findOne
  const ownerId = new mongoose.Types.ObjectId()
  try {
    Pet.findOne = () => ({ select: async () => ({ reportedBy: ownerId }) })
    const response = responseRecorder()
    await createContentReport({ user: { _id: ownerId }, body: { targetType: 'pet', targetId: new mongoose.Types.ObjectId().toString(), reason: 'spam' } }, response, failOnNext)
    assert.equal(response.statusCode, 400)
    assert.equal(response.payload.code, 'SELF_REPORT')
  } finally { Pet.findOne = originalFindOne }
})

test('blocking is scoped to the authenticated blocker and is reversible', async () => {
  const originals = {
    userFindById: User.findById,
    blockExists: UserBlock.exists,
    blockUpsert: UserBlock.findOneAndUpdate,
    blockFind: UserBlock.find,
    userFind: User.find,
    blockDelete: UserBlock.deleteOne,
  }
  const blockerId = new mongoose.Types.ObjectId()
  const blockedId = new mongoose.Types.ObjectId()
  let deleteFilter
  try {
    User.findById = () => ({ select: async () => ({ _id: blockedId, name: 'Community member', avatar: '' }) })
    UserBlock.exists = async () => null
    UserBlock.findOneAndUpdate = async () => ({})
    const createResponse = responseRecorder()
    await blockUser({ user: { _id: blockerId }, params: { userId: String(blockedId) } }, createResponse, failOnNext)
    assert.equal(createResponse.statusCode, 201)
    assert.equal(createResponse.payload.blocked, true)
    assert.deepEqual(Object.keys(createResponse.payload.user).sort(), ['avatar', 'id', 'name'])

    UserBlock.find = () => ({ sort() { return this }, limit: async () => [{ blocker: blockerId, blocked: blockedId, createdAt: new Date('2026-09-26') }] })
    User.find = () => ({ select: async () => [{ _id: blockedId, name: 'Community member', avatar: '' }] })
    const listResponse = responseRecorder()
    await listBlockedUsers({ user: { _id: blockerId } }, listResponse, failOnNext)
    assert.deepEqual(listResponse.payload.users.map((user) => user.id), [String(blockedId)])
    assert.equal(JSON.stringify(listResponse.payload).includes('email'), false)
    assert.equal(JSON.stringify(listResponse.payload).includes('phone'), false)

    UserBlock.deleteOne = async (filter) => { deleteFilter = filter; return { deletedCount: 1 } }
    const deleteResponse = responseRecorder()
    await unblockUser({ user: { _id: blockerId }, params: { userId: String(blockedId) } }, deleteResponse, failOnNext)
    assert.equal(String(deleteFilter.blocker), String(blockerId))
    assert.equal(String(deleteFilter.blocked), String(blockedId))
    assert.deepEqual(deleteResponse.payload, { blocked: false, userId: String(blockedId) })
  } finally {
    User.findById = originals.userFindById
    UserBlock.exists = originals.blockExists
    UserBlock.findOneAndUpdate = originals.blockUpsert
    UserBlock.find = originals.blockFind
    User.find = originals.userFind
    UserBlock.deleteOne = originals.blockDelete
  }
})

test('blocked users cannot read a chat or create a comment, while emergency posts remain addressable', async () => {
  const originals = {
    petFindOne: Pet.findOne,
    blockExists: UserBlock.exists,
    messageFind: Message.find,
    strayFindOne: Stray.findOne,
  }
  const ownerId = new mongoose.Types.ObjectId()
  const finderId = new mongoose.Types.ObjectId()
  const petId = new mongoose.Types.ObjectId()
  const strayId = new mongoose.Types.ObjectId()
  let messageQueryReached = false
  try {
    UserBlock.exists = async () => ({ _id: new mongoose.Types.ObjectId() })
    Pet.findOne = () => ({ select: async () => ({ _id: petId, reportedBy: ownerId }) })
    Message.find = () => { messageQueryReached = true; return [] }
    const chatResponse = responseRecorder()
    await getMessages({ params: { petId: String(petId) }, query: {}, user: { _id: finderId } }, chatResponse, failOnNext)
    assert.equal(chatResponse.statusCode, 403)
    assert.equal(chatResponse.payload.code, 'USER_BLOCKED')
    assert.equal(messageQueryReached, false)

    Stray.findOne = async () => ({ _id: strayId, reportedBy: ownerId, species: 'Dog' })
    const commentResponse = responseRecorder()
    await createComment({ params: { id: String(strayId) }, body: { text: 'Update', submissionId: 'blocked-comment' }, user: { _id: finderId } }, commentResponse, failOnNext)
    assert.equal(commentResponse.statusCode, 403)
    assert.equal(commentResponse.payload.code, 'USER_BLOCKED')
  } finally {
    Pet.findOne = originals.petFindOne
    UserBlock.exists = originals.blockExists
    Message.find = originals.messageFind
    Stray.findOne = originals.strayFindOne
  }
})

test('self-blocking is rejected before database access', async () => {
  const id = new mongoose.Types.ObjectId()
  const response = responseRecorder()
  await blockUser({ user: { _id: id }, params: { userId: String(id) } }, response, failOnNext)
  assert.equal(response.statusCode, 400)
  assert.equal(response.payload.code, 'SELF_BLOCK')
})

test('a blocked relationship suppresses contact fields while preserving the emergency pet post', async () => {
  const originals = { petFindOne: Pet.findOne, userFind: User.find, blockFind: UserBlock.find }
  const viewerId = new mongoose.Types.ObjectId()
  const ownerId = new mongoose.Types.ObjectId()
  const petId = new mongoose.Types.ObjectId()
  try {
    Pet.findOne = async () => ({
      _id: petId, name: 'Maple', species: 'Dog', breed: 'Retriever', district: 'Sha Tin',
      photo: '', photos: [], description: 'Emergency post', ownerName: 'Owner', status: 'lost',
      reportedBy: ownerId, locationName: 'Exact location', location: { type: 'Point', coordinates: [114.18, 22.38] },
      createdAt: new Date(), lastSeen: new Date(), mapX: 50, mapY: 50,
    })
    User.find = () => ({ select: async () => [{ _id: ownerId, name: 'Owner', phone: '+852 5000 0000', privacy: { contactVisibility: 'authenticated' } }] })
    UserBlock.find = () => ({ select: async () => [{ blocker: viewerId, blocked: ownerId }] })
    const response = responseRecorder()
    await getPet({ params: { id: String(petId) }, query: {}, user: { _id: viewerId } }, response, failOnNext)
    assert.equal(response.statusCode, 200)
    assert.equal(response.payload.pet.id, String(petId))
    assert.equal(response.payload.pet.interactionBlocked, true)
    assert.equal(response.payload.pet.canViewContact, false)
    assert.equal('ownerPhone' in response.payload.pet, false)
  } finally {
    Pet.findOne = originals.petFindOne
    User.find = originals.userFind
    UserBlock.find = originals.blockFind
  }
})

test('comment history excludes mutually blocked authors in both rows and pagination totals', async () => {
  const originals = {
    strayExists: Stray.exists,
    blockFind: UserBlock.find,
    commentFind: StrayComment.find,
    commentCount: StrayComment.countDocuments,
  }
  const viewerId = new mongoose.Types.ObjectId()
  const blockedId = new mongoose.Types.ObjectId()
  const strayId = new mongoose.Types.ObjectId()
  let rowFilter
  let countFilter
  try {
    Stray.exists = async () => true
    UserBlock.find = () => ({ select: async () => [{ blocker: blockedId, blocked: viewerId }] })
    StrayComment.find = (filter) => {
      rowFilter = filter
      return { populate() { return this }, sort() { return this }, skip() { return this }, limit: async () => [] }
    }
    StrayComment.countDocuments = async (filter) => { countFilter = filter; return 0 }
    const response = responseRecorder()
    await listComments({ params: { id: String(strayId) }, query: {}, user: { _id: viewerId } }, response, failOnNext)
    assert.deepEqual(rowFilter.author.$nin.map(String), [String(blockedId)])
    assert.deepEqual(countFilter.author.$nin.map(String), [String(blockedId)])
    assert.deepEqual(rowFilter.moderationStatus, { $ne: 'hidden' })
    assert.deepEqual(countFilter.moderationStatus, { $ne: 'hidden' })
    assert.equal(response.payload.pagination.total, 0)
  } finally {
    Stray.exists = originals.strayExists
    UserBlock.find = originals.blockFind
    StrayComment.find = originals.commentFind
    StrayComment.countDocuments = originals.commentCount
  }
})

test('blocked social notifications are hidden without suppressing emergency sighting alerts', async () => {
  const originals = {
    notificationFind: Notification.find,
    blockFind: UserBlock.find,
    messageFind: Message.find,
    commentFind: StrayComment.find,
    petFind: Pet.find,
    strayFind: Stray.find,
  }
  const viewerId = new mongoose.Types.ObjectId()
  const blockedId = new mongoose.Types.ObjectId()
  const messageId = new mongoose.Types.ObjectId()
  try {
    Notification.find = () => ({ sort() { return this }, limit: async () => [
      { _id: new mongoose.Types.ObjectId(), user: viewerId, type: 'message', message: messageId, title: 'Message', body: 'Private message', createdAt: new Date(), read: false },
      { _id: new mongoose.Types.ObjectId(), user: viewerId, type: 'sighting', title: 'Sighting', body: 'Emergency update', createdAt: new Date(), read: false },
    ] })
    UserBlock.find = () => ({ select: async () => [{ blocker: viewerId, blocked: blockedId }] })
    Message.find = () => ({ select: async () => [{ _id: messageId, sentBy: blockedId }] })
    StrayComment.find = () => ({ select: async () => [] })
    Pet.find = () => ({ select: async () => [] })
    Stray.find = () => ({ select: async () => [] })
    const response = responseRecorder()
    await listNotifications({ user: { _id: viewerId } }, response, failOnNext)
    assert.deepEqual(response.payload.notifications.map((item) => item.type), ['sighting'])
  } finally {
    Notification.find = originals.notificationFind
    UserBlock.find = originals.blockFind
    Message.find = originals.messageFind
    StrayComment.find = originals.commentFind
    Pet.find = originals.petFind
    Stray.find = originals.strayFind
  }
})
