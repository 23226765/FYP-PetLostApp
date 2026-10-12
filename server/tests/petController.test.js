import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import User from '../models/User.js'
import Notification from '../models/Notification.js'
import UserBlock from '../models/UserBlock.js'
import {
  getPet,
  getNearbyPets,
  listMyPets,
  listPets,
  listSightings,
  reportPet,
  smartMatch,
  submitSighting,
  validateSightingLocation,
} from '../controllers/petController.js'

const originalUserBlockFind = UserBlock.find
before(() => { UserBlock.find = () => ({ select: async () => [] }) })
after(() => { UserBlock.find = originalUserBlockFind })

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.payload = payload
      return this
    },
  }
}

test('current-user pets are paginated, ownership-scoped, and omit contact details', async () => {
  const originalCountDocuments = Pet.countDocuments
  const originalFind = Pet.find
  const originalUserFind = User.find
  const ownerId = new mongoose.Types.ObjectId()
  const ownedPet = petRecord({ reportedBy: ownerId, ownerPhone: '+852 5555 0101' })
  const countFilters = []

  try {
    Pet.countDocuments = async (filter) => {
      countFilters.push(filter)
      return filter.status === 'reunited' ? 1 : 3
    }
    Pet.find = (filter) => {
      assert.equal(String(filter.reportedBy), String(ownerId))
      return {
        sort() { return this },
        skip(value) { assert.equal(value, 1); return this },
        limit(value) { assert.equal(value, 1); return Promise.resolve([ownedPet]) },
      }
    }
    User.find = () => { throw new Error('profile listing must not query private contact fields') }

    const response = responseRecorder()
    await listMyPets(
      { user: { _id: ownerId }, query: { page: '2', limit: '1' } },
      response,
      failOnNext,
    )

    assert.equal(countFilters.length, 2)
    assert.deepEqual(response.payload.pagination, { page: 2, limit: 1, total: 3, totalPages: 3 })
    assert.deepEqual(response.payload.summary, { total: 3, reunited: 1, active: 2 })
    assert.equal(response.payload.pets.length, 1)
    assert.equal('ownerPhone' in response.payload.pets[0], false)
    assert.equal(response.payload.pets[0].canViewContact, false)
  } finally {
    Pet.countDocuments = originalCountDocuments
    Pet.find = originalFind
    User.find = originalUserFind
  }
})

function failOnNext(error) {
  throw error
}

function petRecord(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    name: 'Maple',
    species: 'Dog',
    breed: 'Golden Retriever',
    district: 'Sha Tin',
    photo: 'https://example.test/maple.jpg',
    photos: ['https://example.test/maple.jpg'],
    description: 'Fictional seeded pet',
    ownerName: 'FYP Owner',
    ownerPhone: '+852 5555 0101',
    status: 'lost',
    locationName: 'Sha Tin Park',
    location: { type: 'Point', coordinates: [114.188, 22.381] },
    lastSeen: new Date('2026-09-10T10:00:00.000Z'),
    createdAt: new Date('2026-09-10T10:00:00.000Z'),
    ...overrides,
  }
}

test('authenticated radar list excludes owner and preserves status/pagination filters', async () => {
  const originalCountDocuments = Pet.countDocuments
  const originalFind = Pet.find
  const originalUserFind = User.find
  const ownerId = new mongoose.Types.ObjectId()
  const otherPet = petRecord({ reportedBy: new mongoose.Types.ObjectId() })
  let countFilter
  let findFilter

  try {
    Pet.countDocuments = async (filter) => {
      countFilter = filter
      return 1
    }
    Pet.find = (filter) => {
      findFilter = filter
      const query = {
        sort() { return this },
        skip() { return this },
        limit() { return Promise.resolve([otherPet]) },
      }
      return query
    }
    User.find = () => ({
      select: async () => [
        {
          _id: otherPet.reportedBy,
          phone: '+852 5555 0199',
          privacy: { contactVisibility: 'authenticated' },
        },
      ],
    })

    const response = responseRecorder()
    await listPets(
      { user: { _id: ownerId }, query: { status: 'lost', page: '1', limit: '10' } },
      response,
      failOnNext,
    )

    assert.equal(String(countFilter.reportedBy.$ne), String(ownerId))
    assert.equal(String(findFilter.reportedBy.$ne), String(ownerId))
    assert.equal(findFilter.status, 'lost')
    assert.equal(response.payload.pets.length, 1)
    assert.deepEqual(response.payload.pagination, {
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    })
  } finally {
    Pet.countDocuments = originalCountDocuments
    Pet.find = originalFind
    User.find = originalUserFind
  }
})

test('authenticated nearby radar applies the same owner and status exclusion', async () => {
  const originalAggregate = Pet.aggregate
  const originalUserFind = User.find
  const ownerId = new mongoose.Types.ObjectId()
  const otherPet = petRecord({
    reportedBy: new mongoose.Types.ObjectId(),
    distanceMeters: 420,
  })
  let capturedPipeline

  try {
    Pet.aggregate = async (pipeline) => {
      capturedPipeline = pipeline
      return [{ items: [otherPet], totals: [{ count: 1 }] }]
    }
    User.find = () => ({
      select: async () => [
        {
          _id: otherPet.reportedBy,
          phone: '+852 5555 0199',
          privacy: { contactVisibility: 'authenticated' },
        },
      ],
    })

    const response = responseRecorder()
    await getNearbyPets(
      {
        user: { _id: ownerId },
        query: { lat: '22.381', lng: '114.188', radiusKm: '5', status: 'lost' },
      },
      response,
      failOnNext,
    )

    const geoNear = capturedPipeline[0].$geoNear
    assert.equal(String(geoNear.query.reportedBy.$ne), String(ownerId))
    assert.deepEqual(capturedPipeline[1].$match, { status: 'lost' })
    assert.equal(response.payload.pets.length, 1)
    assert.equal(response.payload.pagination.total, 1)
  } finally {
    Pet.aggregate = originalAggregate
    User.find = originalUserFind
  }
})

test('pet owner and reporter can see reporter contact while unrelated users cannot', async () => {
  const originalFindOne = Pet.findOne
  const originalFind = Sighting.find
  const originalUserFind = User.find
  const ownerId = new mongoose.Types.ObjectId()
  const reporterId = new mongoose.Types.ObjectId()
  const unrelatedId = new mongoose.Types.ObjectId()
  const petId = new mongoose.Types.ObjectId()
  const sightingId = new mongoose.Types.ObjectId()
  const sighting = {
    _id: sightingId,
    pet: petId,
    reportedBy: reporterId,
    location: { type: 'Point', coordinates: [114.19, 22.38] },
    locationName: 'Sha Tin Park',
    note: 'Near the fountain',
    photo: 'https://example.test/private-sighting.jpg',
    reporterName: 'FYP Finder',
    reporterPhone: '+852 5555 0102',
    confirmedBy: [],
    createdAt: new Date('2026-09-18T08:00:00.000Z'),
  }

  try {
    Pet.findOne = () => ({
      select: async () => ({ _id: petId, reportedBy: ownerId, district: 'Sha Tin' }),
    })
    Sighting.find = () => ({ sort: async () => [sighting, { ...sighting }] })
    User.find = () => ({
      select: async () => [
        {
          _id: reporterId,
          name: 'FYP Finder',
          phone: '+852 5555 0102',
          privacy: { contactVisibility: 'authenticated' },
        },
      ],
    })

    for (const userId of [ownerId, reporterId]) {
      const response = responseRecorder()
      await listSightings({ params: { id: String(petId) }, user: { _id: userId } }, response, failOnNext)
      assert.equal(response.payload.sightings[0].id, String(sightingId))
      assert.equal(response.payload.sightings[0].reporterName, 'FYP Finder')
      assert.equal(response.payload.sightings[0].reporterPhone, '+852 5555 0102')
      assert.equal(response.payload.sightings[0].locationPrecision, 'exact')
      assert.deepEqual(response.payload.sightings[0].coordinates, [114.19, 22.38])
      assert.equal(response.payload.sightings.length, 1)
      assert.equal(response.payload.sightings[0].note, 'Near the fountain')
      assert.equal(response.payload.sightings[0].photo, sighting.photo)
    }

    const unrelatedResponse = responseRecorder()
    await listSightings(
      { params: { id: String(petId) }, user: { _id: unrelatedId } },
      unrelatedResponse,
      failOnNext,
    )
    assert.equal(unrelatedResponse.payload.sightings[0].id, String(sightingId))
    assert.equal('reporterName' in unrelatedResponse.payload.sightings[0], false)
    assert.equal('reporterPhone' in unrelatedResponse.payload.sightings[0], false)
    assert.equal(unrelatedResponse.payload.sightings[0].locationPrecision, 'approximate')
    assert.equal(unrelatedResponse.payload.sightings[0].locationName, 'Sha Tin')
    assert.notDeepEqual(unrelatedResponse.payload.sightings[0].coordinates, [114.19, 22.38])
    assert.equal('note' in unrelatedResponse.payload.sightings[0], false)
    assert.equal('photo' in unrelatedResponse.payload.sightings[0], false)

    const adminResponse = responseRecorder()
    await listSightings(
      {
        params: { id: String(petId) },
        user: { _id: new mongoose.Types.ObjectId(), role: 'shelter_admin' },
      },
      adminResponse,
      failOnNext,
    )
    assert.equal(adminResponse.payload.sightings[0].locationPrecision, 'approximate')
    assert.equal('reporterName' in adminResponse.payload.sightings[0], false)
    assert.equal('note' in adminResponse.payload.sightings[0], false)
    assert.equal('photo' in adminResponse.payload.sightings[0], false)

    const guestResponse = responseRecorder()
    await listSightings({ params: { id: String(petId) } }, guestResponse, failOnNext)
    const guestSighting = guestResponse.payload.sightings[0]
    assert.equal(guestSighting.locationPrecision, 'approximate')
    assert.equal(guestSighting.locationName, 'Sha Tin')
    for (const forbidden of ['note', 'photo', 'reportedBy', 'reporterName', 'reporterPhone']) {
      assert.equal(forbidden in guestSighting, false)
    }
  } finally {
    Pet.findOne = originalFindOne
    Sighting.find = originalFind
    User.find = originalUserFind
  }
})

test('forced-public pet detail remains approximate and contact-free for its owner', async () => {
  const originalFindOne = Pet.findOne
  const originalUserFind = User.find
  const ownerId = new mongoose.Types.ObjectId()
  const record = petRecord({ reportedBy: ownerId })

  try {
    Pet.findOne = async () => record
    User.find = () => ({
      select: async () => [{
        _id: ownerId,
        name: 'FYP Owner',
        phone: '+852 5555 0101',
        privacy: { contactVisibility: 'authenticated' },
      }],
    })

    const exactResponse = responseRecorder()
    await getPet(
      { params: { id: String(record._id) }, query: {}, user: { _id: ownerId } },
      exactResponse,
      failOnNext,
    )
    assert.equal(exactResponse.payload.pet.locationPrecision, 'exact')
    assert.equal(exactResponse.payload.pet.location, 'Sha Tin Park')
    assert.deepEqual(exactResponse.payload.pet.coordinates, [114.188, 22.381])

    const publicResponse = responseRecorder()
    await getPet(
      { params: { id: String(record._id) }, query: { view: 'public' }, user: { _id: ownerId } },
      publicResponse,
      failOnNext,
    )
    assert.equal(publicResponse.payload.pet.locationPrecision, 'approximate')
    assert.equal(publicResponse.payload.pet.location, 'Sha Tin')
    assert.notDeepEqual(publicResponse.payload.pet.coordinates, [114.188, 22.381])
    assert.equal(publicResponse.payload.pet.canViewContact, false)
    assert.equal('ownerPhone' in publicResponse.payload.pet, false)
  } finally {
    Pet.findOne = originalFindOne
    User.find = originalUserFind
  }
})

test('Smart Match keeps exact scoring internal and returns only a distance band', async () => {
  const originalPetFind = Pet.find
  const originalSightingAggregate = Sighting.aggregate
  const originalUserFind = User.find
  const record = petRecord({ reportedBy: new mongoose.Types.ObjectId() })

  try {
    Pet.find = async () => [record]
    Sighting.aggregate = async () => []
    User.find = () => ({ select: async () => [] })
    const response = responseRecorder()
    await smartMatch(
      {
        body: {
          species: 'Dog',
          breed: 'Golden Retriever',
          coordinates: [114.19, 22.382],
        },
      },
      response,
      failOnNext,
    )

    const payload = JSON.parse(JSON.stringify(response.payload))
    assert.equal(payload.matches.length, 1)
    assert.equal('distanceKm' in payload.matches[0].breakdown, false)
    assert.match(payload.matches[0].breakdown.distanceBand, /^(within_1_km|1_to_3_km|3_to_5_km|over_5_km)$/)
    assert.equal(payload.matches[0].locationPrecision, 'approximate')
    assert.notDeepEqual(payload.matches[0].coordinates, record.location.coordinates)
  } finally {
    Pet.find = originalPetFind
    Sighting.aggregate = originalSightingAggregate
    User.find = originalUserFind
  }
})

test('sighting GeoJSON validation rejects missing, malformed, reversed, and string coordinates', () => {
  assert.equal(validateSightingLocation(undefined).error, 'A confirmed sighting location is required.')
  assert.match(validateSightingLocation({ type: 'LineString', coordinates: [114, 22] }).error, /Point/)
  assert.match(validateSightingLocation({ type: 'Point', coordinates: ['114.1', 22.3] }).error, /numbers/)
  assert.match(validateSightingLocation({ type: 'Point', coordinates: [22.3, 114.1] }).error, /latitude/)
  assert.match(validateSightingLocation({ type: 'Point', coordinates: [181, 22.3] }).error, /longitude/)
  assert.match(validateSightingLocation({ type: 'Point', coordinates: [114.1, Number.NaN] }).error, /numbers/)
  assert.deepEqual(
    validateSightingLocation({ type: 'Point', coordinates: [114.1694, 22.3193] }),
    { coordinates: [114.1694, 22.3193] },
  )
})

test('pet reports are owned by the authenticated user and ignore spoofed ownership fields', async () => {
  const originalCreate = Pet.create
  const originalUserFind = User.find
  const originalUserAggregate = User.aggregate
  const originalBulkWrite = Notification.bulkWrite
  const ownerId = new mongoose.Types.ObjectId()
  let createdData

  try {
    Pet.create = async (data) => {
      createdData = data
      return petRecord({
        _id: new mongoose.Types.ObjectId(),
        ...data,
        createdAt: new Date('2026-09-20T08:00:00.000Z'),
      })
    }
    User.aggregate = async () => []
    User.find = () => ({
      select: async () => [{
        _id: ownerId,
        name: 'Authenticated Owner',
        phone: '+852 5555 0111',
        privacy: { contactVisibility: 'private' },
      }],
    })
    Notification.bulkWrite = async () => undefined

    const response = responseRecorder()
    await reportPet({
      user: {
        _id: ownerId,
        name: 'Authenticated Owner',
        phone: '+852 5555 0111',
      },
      body: {
        name: 'Maple',
        species: 'Dog',
        district: 'Sha Tin',
        locationName: 'Sha Tin Park',
        coordinates: [114.188, 22.381],
        ownerName: 'Spoofed Owner',
        ownerPhone: '+852 5555 0999',
        reportedBy: new mongoose.Types.ObjectId().toString(),
      },
    }, response, failOnNext)

    assert.equal(response.statusCode, 201)
    assert.equal(String(createdData.reportedBy), String(ownerId))
    assert.equal(createdData.ownerName, 'Authenticated Owner')
    assert.equal(createdData.ownerPhone, '+852 5555 0111')
  } finally {
    Pet.create = originalCreate
    User.find = originalUserFind
    User.aggregate = originalUserAggregate
    Notification.bulkWrite = originalBulkWrite
  }
})

test('valid selected coordinates preserve lng/lat order and retries create one sighting', async () => {
  const originalFindOne = Pet.findOne
  const originalCreate = Sighting.create
  const originalSightingFindOne = Sighting.findOne
  const originalUserFind = User.find
  const originalUserAggregate = User.aggregate
  const originalBulkWrite = Notification.bulkWrite
  const petId = new mongoose.Types.ObjectId()
  const ownerId = new mongoose.Types.ObjectId()
  const reporterId = new mongoose.Types.ObjectId()
  const sightingId = new mongoose.Types.ObjectId()
  let storedSighting = null
  let createCount = 0
  let saveCount = 0
  const originalSave = Sighting.prototype.save
  const originalUpdateOne = Pet.updateOne
  const connection = Sighting.db
  const originalName = connection.name, originalReady = connection.readyState, originalStartSession = connection.startSession
  const pet = petRecord({
    _id: petId,
    reportedBy: ownerId,
    async save() { saveCount += 1 },
  })

  try {
    connection.name = 'petlostapp'; connection.readyState = 1
    connection.startSession = async () => ({ withTransaction: async (callback) => callback(), endSession: async () => {} })
    Pet.findOne = () => ({ session() { return this }, then(resolve) { return Promise.resolve(pet).then(resolve) } })
    Pet.updateOne = async (_filter, _update, { session }) => { assert.ok(session); saveCount++; return { matchedCount: 1 } }
    Sighting.findOne = () => ({
      select() { return this }, session() { return this }, then(resolve) { return Promise.resolve(storedSighting).then(resolve) },
    })
    Sighting.prototype.save = async function ({ session }) {
      assert.ok(session)
      createCount += 1
      this._id = sightingId
      this.createdAt = new Date('2026-09-18T08:00:00.000Z')
      storedSighting = this
      return storedSighting
    }
    User.aggregate = async () => []
    User.find = () => ({
      select: async () => [
        {
          _id: ownerId,
          phone: '+852 5555 0101',
          privacy: { contactVisibility: 'private' },
        },
      ],
    })
    Notification.bulkWrite = async () => undefined

    const request = {
      params: { id: String(petId) },
      user: { _id: reporterId, name: 'Finder', phone: '+852 5555 0102' },
      body: {
        location: { type: 'Point', coordinates: [114.1694, 22.3193] },
        locationName: 'Mong Kok MTR Exit E2',
        note: 'Seen walking north',
        reporterName: 'Spoofed Reporter',
        reporterPhone: '+852 5555 0999',
        submissionId: 'sighting_test_retry_001',
      },
    }

    const firstResponse = responseRecorder()
    await submitSighting(request, firstResponse, failOnNext)
    assert.equal(firstResponse.statusCode, 201)
    assert.deepEqual(storedSighting.location.toObject(), {
      type: 'Point',
      coordinates: [114.1694, 22.3193],
    })
    assert.equal(storedSighting.locationName, 'Mong Kok MTR Exit E2')
    assert.equal(String(storedSighting.reportedBy), String(reporterId))
    assert.equal(storedSighting.reporterName, 'Finder')
    assert.equal(storedSighting.reporterPhone, '+852 5555 0102')

    const retryResponse = responseRecorder()
    await submitSighting(request, retryResponse, failOnNext)
    assert.equal(retryResponse.statusCode, 200)
    assert.equal(retryResponse.payload.duplicate, true)
    assert.equal(createCount, 1)
    assert.equal(saveCount, 1)
  } finally {
    Pet.findOne = originalFindOne
    Sighting.create = originalCreate
    Sighting.findOne = originalSightingFindOne
    User.find = originalUserFind
    User.aggregate = originalUserAggregate
    Notification.bulkWrite = originalBulkWrite
    Sighting.prototype.save = originalSave
    Pet.updateOne = originalUpdateOne
    connection.name = originalName; connection.readyState = originalReady; connection.startSession = originalStartSession
  }
})

test('missing selected location is rejected without inserting a fallback coordinate', async () => {
  const originalFindOne = Pet.findOne
  const originalCreate = Sighting.create
  let createCount = 0
  try {
    Pet.findOne = async () => petRecord()
    Sighting.create = async () => {
      createCount += 1
    }
    const response = responseRecorder()
    await submitSighting(
      {
        params: { id: String(new mongoose.Types.ObjectId()) },
        body: {
          locationName: 'Mong Kok',
          note: 'The note must not determine coordinates',
          submissionId: 'sighting_missing_location_001',
        },
      },
      response,
      failOnNext,
    )
    assert.equal(response.statusCode, 400)
    assert.equal(response.payload.error, 'A confirmed sighting location is required.')
    assert.equal(createCount, 0)
  } finally {
    Pet.findOne = originalFindOne
    Sighting.create = originalCreate
  }
})
