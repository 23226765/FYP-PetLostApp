import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import Notification from '../models/Notification.js'
import Message from '../models/Message.js'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import Stray from '../models/Stray.js'
import StrayComment from '../models/StrayComment.js'
import UserBlock from '../models/UserBlock.js'
import User from '../models/User.js'
import {
  getNearbyPets,
  getPet,
  listPets,
  listSightings,
  smartMatch,
  updateStatus,
} from '../controllers/petController.js'
import { getStray, listSavedStrays, listStrays } from '../controllers/strayController.js'
import {
  createRadiusNotifications,
  listNotifications,
} from '../controllers/notificationController.js'
import SavedStray from '../models/SavedStray.js'
import { getMessages } from '../controllers/chatController.js'
import {
  isContentVisible,
  visibleContentFilter,
} from '../services/moderationVisibility.js'

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this },
    set() { return this },
    json(payload) { this.payload = payload; return this },
  }
}

function failOnNext(error) { throw error }

test('missing moderation status remains visible while hidden is excluded by the shared predicate', () => {
  assert.equal(isContentVisible({}), true)
  assert.equal(isContentVisible({ moderationStatus: 'visible' }), true)
  assert.equal(isContentVisible({ moderationStatus: 'hidden' }), false)
  assert.deepEqual(visibleContentFilter({ status: 'lost' }), {
    status: 'lost',
    moderationStatus: { $ne: 'hidden' },
  })
})

test('pet lists, nearby radar, and Smart Match all query only visible content', async () => {
  const originals = {
    count: Pet.countDocuments,
    find: Pet.find,
    aggregate: Pet.aggregate,
    sightingAggregate: Sighting.aggregate,
  }
  const captured = {}
  try {
    Pet.countDocuments = async (filter) => { captured.list = filter; return 0 }
    Pet.find = (filter) => {
      captured.find = filter
      return {
        sort() { return this }, skip() { return this }, limit: async () => [],
        then(resolve, reject) { return Promise.resolve([]).then(resolve, reject) },
      }
    }
    const listed = responseRecorder()
    await listPets({ query: {} }, listed, failOnNext)
    assert.deepEqual(captured.list.moderationStatus, { $ne: 'hidden' })

    Pet.aggregate = async (pipeline) => {
      captured.nearby = pipeline
      return [{ items: [], totals: [] }]
    }
    const nearby = responseRecorder()
    await getNearbyPets(
      { query: { lat: '22.38', lng: '114.18', radiusKm: '5' } },
      nearby,
      failOnNext,
    )
    assert.deepEqual(captured.nearby[0].$geoNear.query.moderationStatus, { $ne: 'hidden' })

    Pet.find = async (filter) => { captured.match = filter; return [] }
    Sighting.aggregate = async () => []
    const matches = responseRecorder()
    await smartMatch(
      { body: { species: 'Dog', coordinates: [114.18, 22.38] } },
      matches,
      failOnNext,
    )
    assert.deepEqual(captured.match.moderationStatus, { $ne: 'hidden' })
    assert.deepEqual(matches.payload.matches, [])
  } finally {
    Pet.countDocuments = originals.count
    Pet.find = originals.find
    Pet.aggregate = originals.aggregate
    Sighting.aggregate = originals.sightingAggregate
  }
})

test('hidden pet details return 404 to their owner and ordinary owner mutations cannot bypass hiding', async () => {
  const originalFindOne = Pet.findOne
  const ownerId = new mongoose.Types.ObjectId()
  const petId = new mongoose.Types.ObjectId()
  const seenFilters = []
  try {
    Pet.findOne = (filter) => {
      seenFilters.push(filter)
      return {
        select: async () => null,
        then(resolve, reject) { return Promise.resolve(null).then(resolve, reject) },
      }
    }
    const detail = responseRecorder()
    await getPet(
      { params: { id: String(petId) }, query: {}, user: { _id: ownerId } },
      detail,
      failOnNext,
    )
    assert.equal(detail.statusCode, 404)

    const mutation = responseRecorder()
    await updateStatus(
      { params: { id: String(petId) }, body: { status: 'reunited' }, user: { _id: ownerId } },
      mutation,
      failOnNext,
    )
    assert.equal(mutation.statusCode, 404)
    assert.ok(seenFilters.every((filter) => filter.moderationStatus?.$ne === 'hidden'))
  } finally {
    Pet.findOne = originalFindOne
  }
})

test('a hidden pet suppresses its entire ordinary sighting history', async () => {
  const originals = { petFindOne: Pet.findOne, sightingFind: Sighting.find }
  const petId = new mongoose.Types.ObjectId()
  let sightingQueryReached = false
  try {
    Pet.findOne = () => ({ select: async () => null })
    Sighting.find = () => { sightingQueryReached = true; return [] }
    const response = responseRecorder()
    await listSightings(
      { params: { id: String(petId) }, user: { _id: new mongoose.Types.ObjectId() } },
      response,
      failOnNext,
    )
    assert.equal(response.statusCode, 404)
    assert.equal(sightingQueryReached, false)
  } finally {
    Pet.findOne = originals.petFindOne
    Sighting.find = originals.sightingFind
  }
})

test('a hidden sighting is removed without suppressing other visible sightings', async () => {
  const originals = {
    petFindOne: Pet.findOne,
    sightingFind: Sighting.find,
    userFind: User.find,
  }
  const petId = new mongoose.Types.ObjectId()
  const visibleId = new mongoose.Types.ObjectId()
  let sightingFilter
  try {
    Pet.findOne = () => ({
      select: async () => ({ _id: petId, reportedBy: new mongoose.Types.ObjectId(), district: 'Sha Tin' }),
    })
    Sighting.find = (filter) => {
      sightingFilter = filter
      return { sort: async () => [{
        _id: visibleId, pet: petId, reportedBy: new mongoose.Types.ObjectId(),
        location: { type: 'Point', coordinates: [114.18, 22.38] },
        locationName: 'Park', confirmedBy: [], createdAt: new Date(),
      }] }
    }
    User.find = () => ({ select: async () => [] })
    const response = responseRecorder()
    await listSightings({ params: { id: String(petId) } }, response, failOnNext)
    assert.deepEqual(sightingFilter.moderationStatus, { $ne: 'hidden' })
    assert.equal(response.payload.sightings.length, 1)
    assert.equal(response.payload.sightings[0].id, String(visibleId))
  } finally {
    Pet.findOne = originals.petFindOne
    Sighting.find = originals.sightingFind
    User.find = originals.userFind
  }
})

test('hidden rescue posts return 404 to their author and resolve as unavailable when saved', async () => {
  const originals = {
    strayFindOne: Stray.findOne,
    strayFind: Stray.find,
    saveFind: SavedStray.find,
    saveCount: SavedStray.countDocuments,
  }
  const authorId = new mongoose.Types.ObjectId()
  const strayId = new mongoose.Types.ObjectId()
  try {
    Stray.findOne = async (filter) => {
      assert.deepEqual(filter.moderationStatus, { $ne: 'hidden' })
      return null
    }
    const detail = responseRecorder()
    await getStray(
      { params: { id: String(strayId) }, query: {}, user: { _id: authorId } },
      detail,
      failOnNext,
    )
    assert.equal(detail.statusCode, 404)

    SavedStray.find = (filter) => filter.stray
      ? { select: async () => [] }
      : {
          sort() { return this }, skip() { return this }, limit: async () => [{ stray: strayId }],
        }
    SavedStray.countDocuments = async () => 1
    Stray.find = async (filter) => {
      assert.deepEqual(filter.moderationStatus, { $ne: 'hidden' })
      return []
    }
    const saved = responseRecorder()
    await listSavedStrays(
      { query: {}, user: { _id: authorId } },
      saved,
      failOnNext,
    )
    assert.deepEqual(saved.payload.strays, [])
    assert.equal(saved.payload.unavailableCount, 1)
  } finally {
    Stray.findOne = originals.strayFindOne
    Stray.find = originals.strayFind
    SavedStray.find = originals.saveFind
    SavedStray.countDocuments = originals.saveCount
  }
})

test('a hidden rescue post becomes unavailable through an existing shared-message reference', async () => {
  const originals = {
    petFindOne: Pet.findOne,
    messageFind: Message.find,
    strayFind: Stray.find,
    blockExists: UserBlock.exists,
  }
  const ownerId = new mongoose.Types.ObjectId()
  const finderId = new mongoose.Types.ObjectId()
  const petId = new mongoose.Types.ObjectId()
  const strayId = new mongoose.Types.ObjectId()
  try {
    Pet.findOne = () => ({ select: async () => ({ _id: petId, reportedBy: ownerId }) })
    UserBlock.exists = async () => null
    Message.find = () => ({ sort: async () => [{
      _id: new mongoose.Types.ObjectId(), pet: petId, participant: finderId,
      sender: 'finder', sentBy: finderId, text: '', sharedStray: strayId,
      createdAt: new Date(),
    }] })
    Stray.find = (filter) => {
      assert.deepEqual(filter.moderationStatus, { $ne: 'hidden' })
      return { select: async () => [] }
    }
    const response = responseRecorder()
    await getMessages(
      { params: { petId: String(petId) }, query: {}, user: { _id: finderId } },
      response,
      failOnNext,
    )
    assert.equal(response.payload.messages[0].sharedStray, undefined)
    assert.equal(response.payload.messages[0].sharedStrayUnavailable, true)
  } finally {
    Pet.findOne = originals.petFindOne
    Message.find = originals.messageFind
    Stray.find = originals.strayFind
    UserBlock.exists = originals.blockExists
  }
})

test('hidden comments are excluded from visible comment counts and previews', async () => {
  const originals = {
    strayFind: Stray.find,
    strayCount: Stray.countDocuments,
    commentAggregate: StrayComment.aggregate,
    userFind: User.find,
  }
  const strayId = new mongoose.Types.ObjectId()
  const reporterId = new mongoose.Types.ObjectId()
  const stray = {
    _id: strayId, species: 'Dog', animalType: '', description: 'Waiting safely',
    photo: '', photos: [], condition: 'healthy', district: 'Sha Tin',
    locationName: 'Park', location: { type: 'Point', coordinates: [114.18, 22.38] },
    rescueStatus: 'reported', reportedBy: reporterId, reporterName: 'Reporter',
    active: true, createdAt: new Date(), updatedAt: new Date(), statusUpdatedAt: new Date(),
  }
  try {
    Stray.find = () => ({
      sort() { return this }, skip() { return this }, limit: async () => [stray],
    })
    Stray.countDocuments = async () => 1
    User.find = () => ({ select: async () => [{ _id: reporterId, name: 'Reporter', avatar: '' }] })
    StrayComment.aggregate = async (pipeline) => {
      assert.deepEqual(pipeline[0].$match.moderationStatus, { $ne: 'hidden' })
      return pipeline.some((stage) => stage.$group?.count)
        ? [{ _id: strayId, count: 1 }]
        : [{ _id: strayId, text: 'Visible update' }]
    }
    const response = responseRecorder()
    await listStrays({ query: {} }, response, failOnNext)
    assert.equal(response.payload.strays[0].commentCount, 1)
    assert.equal(response.payload.strays[0].commentPreview, 'Visible update')
  } finally {
    Stray.find = originals.strayFind
    Stray.countDocuments = originals.strayCount
    StrayComment.aggregate = originals.commentAggregate
    User.find = originals.userFind
  }
})

test('notifications with hidden or unavailable targets are omitted instead of linking to them', async () => {
  const originals = {
    notificationFind: Notification.find,
    petFind: Pet.find,
    sightingFind: Sighting.find,
    strayFind: Stray.find,
    commentFind: StrayComment.find,
    blockFind: UserBlock.find,
  }
  const userId = new mongoose.Types.ObjectId()
  const petId = new mongoose.Types.ObjectId()
  try {
    Notification.find = () => ({
      sort() { return this },
      limit: async () => [{
        _id: new mongoose.Types.ObjectId(), user: userId, pet: petId,
        type: 'proximity', title: 'Hidden target', body: 'Hidden', createdAt: new Date(),
      }],
    })
    Pet.find = (filter) => {
      assert.deepEqual(filter.moderationStatus, { $ne: 'hidden' })
      return { select: async () => [] }
    }
    Sighting.find = () => ({ select: async () => [] })
    Stray.find = () => ({ select: async () => [] })
    StrayComment.find = () => ({ select: async () => [] })
    UserBlock.find = () => ({ select: async () => [] })
    const response = responseRecorder()
    await listNotifications({ user: { _id: userId } }, response, failOnNext)
    assert.deepEqual(response.payload.notifications, [])
  } finally {
    Notification.find = originals.notificationFind
    Pet.find = originals.petFind
    Sighting.find = originals.sightingFind
    Stray.find = originals.strayFind
    StrayComment.find = originals.commentFind
    UserBlock.find = originals.blockFind
  }
})

test('notification generation is a no-op for hidden pets or hidden sightings', async () => {
  const originalBulkWrite = Notification.bulkWrite
  let writes = 0
  try {
    Notification.bulkWrite = async () => { writes += 1 }
    await createRadiusNotifications({
      pet: {
        _id: new mongoose.Types.ObjectId(),
        moderationStatus: 'hidden',
        location: { coordinates: [114.18, 22.38] },
      },
      type: 'proximity',
      origin: [114.18, 22.38],
    })
    await createRadiusNotifications({
      pet: { _id: new mongoose.Types.ObjectId(), moderationStatus: 'visible' },
      sighting: { _id: new mongoose.Types.ObjectId(), moderationStatus: 'hidden' },
      type: 'sighting',
      origin: [114.18, 22.38],
    })
    assert.equal(writes, 0)
  } finally {
    Notification.bulkWrite = originalBulkWrite
  }
})
