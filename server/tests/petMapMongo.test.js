import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import MediaAsset from '../models/MediaAsset.js'
import { listMapPets } from '../controllers/petController.js'
import { createSightingSubmission } from '../services/sightingSubmission.js'
import { approximateCoordinates, publicCellCentre, EARTH_RADIUS_METERS } from '../services/locationPrivacy.js'
import { openTransactionDatabase } from './helpers/localTransactions.js'

const uri = process.env.MEDIA_TEST_MONGODB_URI
const point = coordinates => ({ type: 'Point', coordinates })
const centre = approximateCoordinates([114.188123, 22.381456])
const cell = ([lng, lat]) => [Math.floor(EARTH_RADIUS_METERS * lng * Math.PI / 180 / 750), Math.floor(EARTH_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / 750)]
function distanceKm(a, b) {
  const rad = Math.PI / 180
  const h = Math.sin((b[1] - a[1]) * rad / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin((b[0] - a[0]) * rad / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, h))) / 1000
}
const markerKeys = ['id', 'name', 'species', 'breed', 'status', 'district', 'photo', 'coordinates', 'locationPrecision', 'locationSource'].sort()
function assertPublic(payload, bounds) {
  assert.deepEqual(Object.keys(payload).sort(), bounds ? ['bounds', 'gridSizeMeters', 'markers', 'pagination'] : ['gridSizeMeters', 'markers', 'pagination', 'radiusKm'])
  if (bounds) assert.deepEqual(payload.bounds, bounds)
  assert.deepEqual(Object.keys(payload.pagination).sort(), ['hasMore', 'limit', 'page', 'total', 'totalPages'])
  for (const marker of payload.markers) {
    assert.deepEqual(Object.keys(marker).sort(), markerKeys)
    assert.equal(marker.locationPrecision, 'approximate')
    assert.equal(marker.locationSource, 'stored_report')
  }
  for (const forbidden of ['PRIVATE', 'reportedBy', 'ownerPhone', 'internalDistance', 'moderationReason', 'locationName', 'createdAt', 'publicCell']) assert.equal(JSON.stringify(payload).includes(forbidden), false)
}

test('real MongoDB map: complete public-cell membership, role exclusions, pagination and original report location', {
  skip: !uri ? 'Dedicated local replica set required; application databases prohibited.' : false, timeout: 120000,
}, async t => {
  const { connection, database } = await openTransactionDatabase(uri, 'map', t)
  const Pets = connection.model('Pet', Pet.schema.clone()), Sightings = connection.model('Sighting', Sighting.schema.clone()), Assets = connection.model('MediaAsset', MediaAsset.schema.clone())
  const petIds = [], sightingIds = [], originalAggregate = Pet.aggregate
  const owner = { _id: new mongoose.Types.ObjectId(), role: 'user' }, reporter = { _id: new mongoose.Types.ObjectId(), role: 'user' }
  const unrelated = { _id: new mongoose.Types.ObjectId(), role: 'user' }, admin = { _id: new mongoose.Types.ObjectId(), role: 'shelter_admin' }
  const execute = async (origin = centre, radiusKm = 20, user, page = 1, extra = {}) => {
    let payload
    await listMapPets({ user, query: { lng: String(origin[0]), lat: String(origin[1]), radiusKm: String(radiusKm), page: String(page), ...extra } }, { set() {}, json(value) { payload = value } }, error => { throw error })
    assertPublic(payload)
    return payload
  }
  const executeViewport = async (bounds, user, page = 1, extra = {}) => {
    let payload
    await listMapPets({ user, query: { ...bounds, page: String(page), ...extra } }, { set() {}, json(value) { payload = value } }, error => { throw error })
    assertPublic(payload, bounds)
    return payload
  }
  const insert = async rows => {
    const values = rows.map(row => ({ _id: new mongoose.Types.ObjectId(), ...row }))
    petIds.push(...values.map(row => row._id)); await Pets.collection.insertMany(values)
    return values
  }
  try {
    for (const Model of [Pets, Sightings, Assets]) { await Model.createCollection(); await Model.createIndexes() }
    Pet.aggregate = (...args) => Pets.aggregate(...args)
    const [x, y] = cell(centre), secondCell = publicCellCentre(x + 2, y)
    const base = { name: 'Synthetic map pet', species: 'Dog', breed: 'Mixed', status: 'lost', district: 'Sha Tin', location: point([centre[0] - .002, centre[1] - .002]), ownerPhone: 'PRIVATE_PHONE', locationName: 'PRIVATE_ADDRESS', moderationReason: 'PRIVATE_REASON', reportedBy: owner._id }
    const rows = await insert([
      ...Array.from({ length: 805 }, (_, index) => ({ ...base, status: index % 2 ? 'sighted' : 'lost', reportedBy: index % 2 ? reporter._id : owner._id })),
      ...Array.from({ length: 10 }, () => ({ ...base, location: point(secondCell), species: 'Cat', reportedBy: reporter._id, moderationStatus: 'visible' })),
      { ...base, moderationStatus: 'hidden' }, { ...base, status: 'reunited' }, { ...base, location: point([114.9, 22.38]) },
      { name: 'Legacy no usable location', status: 'lost' },
    ])
    await t.test('all eligible 815 records contribute, with deterministic pages and accurate own-exclusion', async () => {
      const pages = await Promise.all(Array.from({ length: 9 }, (_, index) => execute(centre, 20, undefined, index + 1)))
      assert.equal(pages[0].pagination.total, 815); assert.equal(pages[0].pagination.totalPages, 9)
      assert.equal(pages[0].pagination.hasMore, true); assert.equal(pages[8].pagination.hasMore, false)
      const ids = pages.flatMap(page => page.markers.map(marker => marker.id))
      assert.equal(ids.length, 815); assert.equal(new Set(ids).size, 815); assert.deepEqual(ids, [...ids].sort())
      assert.equal(pages[8].markers.length, 15)
      assert.equal((await execute(centre, 20, owner)).pagination.total, 412)
      assert.equal((await execute(centre, 20, reporter)).pagination.total, 403)
      for (const user of [unrelated, admin]) assert.equal((await execute(centre, 20, user)).pagination.total, 815)
      assert.equal((await execute(centre, 20, undefined, 1, { species: 'Cat' })).pagination.total, 10)
      assert.equal((await execute(centre, 20, undefined, 1, { district: 'Tai Po' })).pagination.total, 0)
    })
    await t.test('moving 805 records inside one public cell cannot change any response field across origins, radius boundaries, roles or pages', async () => {
      const cases = []
      for (const origin of [publicCellCentre(x - 4, y), publicCellCentre(x + 5, y + 3), publicCellCentre(x, y - 4)]) {
        const boundary = distanceKm(origin, centre)
        assert.ok(boundary > 1)
        for (const radius of [boundary - .000001, boundary, boundary + .000001]) {
          for (const user of [undefined, owner, reporter, unrelated, admin]) {
            for (const page of [1, 9]) cases.push({ origin, radius, user, page, before: await execute(origin, radius, user, page) })
          }
        }
      }
      const moved = [centre[0] + .002, centre[1] + .002]
      assert.deepEqual(approximateCoordinates(moved), centre)
      assert.deepEqual(approximateCoordinates(base.location.coordinates), centre)
      await Pets.updateMany({ _id: { $in: rows.slice(0, 805).map(row => row._id) } }, { $set: { location: point(moved) } })
      for (const scenario of cases) assert.deepEqual(await execute(scenario.origin, scenario.radius, scenario.user, scenario.page), scenario.before)
      t.diagnostic(`${cases.length} full public-response invariance comparisons using real geospatial aggregation (including 805 moved records).`)
    })
    await t.test('viewport queries paginate all eligible records and preserve role and filter exclusions', async () => {
      const bounds = { west: 113.82, south: 22.15, east: 114.50, north: 22.57 }
      const pages = await Promise.all(Array.from({ length: 9 }, (_, index) => executeViewport(bounds, undefined, index + 1)))
      assert.equal(pages[0].pagination.total, 815)
      assert.equal(pages[0].pagination.totalPages, 9)
      assert.equal(pages[8].pagination.hasMore, false)
      const ids = pages.flatMap(page => page.markers.map(marker => marker.id))
      assert.equal(ids.length, 815); assert.equal(new Set(ids).size, 815)
      assert.deepEqual(ids, [...ids].sort())
      assert.equal((await executeViewport(bounds, owner)).pagination.total, 412)
      assert.equal((await executeViewport(bounds, reporter)).pagination.total, 403)
      for (const user of [unrelated, admin]) assert.equal((await executeViewport(bounds, user)).pagination.total, 815)
      assert.equal((await executeViewport(bounds, undefined, 1, { species: 'Cat' })).pagination.total, 10)
      assert.equal((await executeViewport(bounds, undefined, 1, { district: 'Tai Po' })).pagination.total, 0)
    })
    await t.test('viewport edge and corner membership depends only on public cells, even when source points lie outside bounds', async () => {
      // Use unrounded public centres for boundary comparisons, matching MongoDB.
      const lng = (x + .5) * 750 / EARTH_RADIUS_METERS * 180 / Math.PI
      const lat = (2 * Math.atan(Math.exp((y + .5) * 750 / EARTH_RADIUS_METERS)) - Math.PI / 2) * 180 / Math.PI
      const epsilon = .0000001
      const small = { west: lng - epsilon, south: lat - epsilon, east: lng + epsilon, north: lat + epsilon }
      assert.equal((await executeViewport(small)).pagination.total, 805)
      const scenarios = [{ bounds: small, included: true }]
      for (const [edge, coordinate, sign] of [['west', lng, 1], ['east', lng, -1], ['south', lat, 1], ['north', lat, -1]]) {
        const surrounding = { west: lng - .003, south: lat - .003, east: lng + .003, north: lat + .003 }
        for (const included of [true, false]) scenarios.push({ bounds: { ...surrounding, [edge]: coordinate + sign * epsilon * (included ? -1 : 1) }, included })
      }
      for (const horizontal of [-1, 1]) for (const vertical of [-1, 1]) {
        scenarios.push({ included: true, bounds: {
          west: lng - (horizontal === -1 ? epsilon : .003), east: lng + (horizontal === 1 ? epsilon : .003),
          south: lat - (vertical === -1 ? epsilon : .003), north: lat + (vertical === 1 ? epsilon : .003),
        } })
      }
      const cases = []
      for (const scenario of scenarios) for (const [user, count] of [[undefined, 805], [owner, 402], [reporter, 403], [unrelated, 805], [admin, 805]]) {
        for (const page of [1, 9]) {
          const before = await executeViewport(scenario.bounds, user, page)
          assert.equal(before.pagination.total, scenario.included ? count : 0)
          cases.push({ ...scenario, user, page, before })
        }
      }
      const moved = [centre[0] - .002, centre[1] - .002]
      assert.deepEqual(approximateCoordinates(moved), centre)
      await Pets.updateMany({ _id: { $in: rows.slice(0, 805).map(row => row._id) } }, { $set: { location: point(moved) } })
      for (const scenario of cases) assert.deepEqual(await executeViewport(scenario.bounds, scenario.user, scenario.page), scenario.before)
      t.diagnostic(`${cases.length} full viewport-response invariance comparisons across edges, corners, roles and pages; exact source points moved within the same public cell.`)
    })
    await t.test('actual sighting transaction changes status but preserves original report A instead of subsequent sighting B', async () => {
      const petId = new mongoose.Types.ObjectId(); petIds.push(petId)
      const origin = [114.16, 22.32], sighting = [114.29, 22.44], submissionId = randomUUID()
      await Pets.create({ _id: petId, reportedBy: owner._id, name: 'Synthetic original report', species: 'Dog', status: 'lost', location: point(origin) })
      const submit = createSightingSubmission({ Pets, Sightings })
      const input = { petId, userId: reporter._id, submissionId, imageIds: [], values: { pet: petId, reportedBy: reporter._id, submissionId, location: point(sighting), locationName: 'Synthetic later sighting' } }
      const options = { connection, Assets, expectedDatabase: database, retire: async () => assert.fail('Photo-free sighting must not touch provider') }
      const created = await submit(input, options); sightingIds.push(created.doc._id)
      const replay = await submit(input, options)
      assert.equal(replay.duplicate, true)
      assert.equal(await Sightings.countDocuments({ pet: petId }), 1)
      const pet = await Pets.findById(petId)
      assert.equal(pet.status, 'sighted'); assert.deepEqual([...pet.location.coordinates], origin)
      assert.deepEqual([...(await Sightings.findById(created.doc._id)).location.coordinates], sighting)
      const map = await execute(origin, 1)
      const marker = map.markers.find(item => item.id === String(petId))
      assert.ok(marker); assert.deepEqual(marker.coordinates, approximateCoordinates(origin)); assert.notDeepEqual(marker.coordinates, approximateCoordinates(sighting))
      assert.equal((await execute(origin, 1, owner)).markers.some(item => item.id === String(petId)), false)
    })
  } finally {
    Pet.aggregate = originalAggregate
    try {
      const created = await Sightings.find({ pet: { $in: petIds } }).select('_id').lean()
      sightingIds.push(...created.map(item => item._id))
      await Sightings.deleteMany({ _id: { $in: sightingIds } }); await Pets.deleteMany({ _id: { $in: petIds } })
      assert.equal(await Pets.countDocuments({ _id: { $in: petIds } }), 0)
      assert.equal(await Sightings.countDocuments({ pet: { $in: petIds } }), 0)
      assert.equal(await Assets.countDocuments(), 0)
      t.diagnostic('Exact isolated map fixture cleanup verified: zero tracked pets, sightings or assets remain; no provider operations.')
    } finally { await connection.close() }
  }
})
