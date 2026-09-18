import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import User from '../models/User.js'
import Notification from '../models/Notification.js'
import {
  getNearbyPets,
  listPets,
  listSightings,
  submitSighting,
  validateSightingLocation,
} from '../controllers/petController.js'

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
  const originalFindById = Pet.findById
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
    photo: '',
    reporterName: 'FYP Finder',
    reporterPhone: '+852 5555 0102',
    confirmedBy: [],
    createdAt: new Date('2026-09-18T08:00:00.000Z'),
  }

  try {
    Pet.findById = () => ({ select: async () => ({ _id: petId, reportedBy: ownerId }) })
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
      assert.equal(response.payload.sightings.length, 1)
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
  } finally {
    Pet.findById = originalFindById
    Sighting.find = originalFind
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

test('valid selected coordinates preserve lng/lat order and retries create one sighting', async () => {
  const originalFindById = Pet.findById
  const originalCreate = Sighting.create
  const originalFindOne = Sighting.findOne
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
  const pet = petRecord({
    _id: petId,
    reportedBy: ownerId,
    async save() { saveCount += 1 },
  })

  try {
    Pet.findById = async () => pet
    Sighting.findOne = () => ({
      select: async () => storedSighting,
    })
    Sighting.create = async (data) => {
      createCount += 1
      storedSighting = {
        _id: sightingId,
        ...data,
        confirmedBy: [],
        createdAt: new Date('2026-09-18T08:00:00.000Z'),
      }
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
        submissionId: 'sighting_test_retry_001',
      },
    }

    const firstResponse = responseRecorder()
    await submitSighting(request, firstResponse, failOnNext)
    assert.equal(firstResponse.statusCode, 201)
    assert.deepEqual(storedSighting.location, {
      type: 'Point',
      coordinates: [114.1694, 22.3193],
    })
    assert.equal(storedSighting.locationName, 'Mong Kok MTR Exit E2')

    const retryResponse = responseRecorder()
    await submitSighting(request, retryResponse, failOnNext)
    assert.equal(retryResponse.statusCode, 200)
    assert.equal(retryResponse.payload.duplicate, true)
    assert.equal(createCount, 1)
    assert.equal(saveCount, 1)
  } finally {
    Pet.findById = originalFindById
    Sighting.create = originalCreate
    Sighting.findOne = originalFindOne
    User.find = originalUserFind
    User.aggregate = originalUserAggregate
    Notification.bulkWrite = originalBulkWrite
  }
})

test('missing selected location is rejected without inserting a fallback coordinate', async () => {
  const originalFindById = Pet.findById
  const originalCreate = Sighting.create
  let createCount = 0
  try {
    Pet.findById = async () => petRecord()
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
    Pet.findById = originalFindById
    Sighting.create = originalCreate
  }
})
