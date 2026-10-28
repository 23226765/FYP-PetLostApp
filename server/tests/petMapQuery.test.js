import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import express from 'express'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import Pet from '../models/Pet.js'
import User from '../models/User.js'
import petsRouter from '../routes/pets.js'
import { parsePetMapQuery, petMapPipeline, publicPetMapResult, PET_MAP_QUERY_OPTIONS } from '../services/petMapQuery.js'
import { approximateCoordinates, publicCellCentre } from '../services/locationPrivacy.js'

const query = { lng: '114.188123', lat: '22.381456' }
const bounds = { west: 113.82, south: 22.15, east: 114.50, north: 22.57 }

test('viewport validates complete exclusive bounds and conservatively caps indexed candidates at 50 km', () => {
  for (const invalidBounds of [
    { west: 114 }, { ...bounds, north: undefined }, { ...bounds, west: '' }, { ...bounds, east: ['114.5'] },
    { ...bounds, south: NaN }, { ...bounds, north: Infinity }, { ...bounds, west: -181 },
    { ...bounds, east: 181 }, { ...bounds, north: 86 }, { ...bounds, south: -86 },
    { ...bounds, east: bounds.west }, { ...bounds, north: bounds.south },
    { ...bounds, west: 115 }, { ...bounds, south: 23 },
    { ...bounds, lng: 114 }, { ...bounds, lat: 22 }, { ...bounds, radiusKm: 20 },
    { west: 113, south: 21, east: 115, north: 23 },
    // Public cells at the Mercator clamp can contain source points up to a pole.
    { west: 0, south: 85.048, east: .001, north: 85.05 },
  ]) assert.throws(() => parsePetMapQuery(invalidBounds), { code: 'MAP_QUERY_INVALID' })
  const options = parsePetMapQuery(bounds)
  assert.deepEqual(options.bounds, bounds)
  assert.equal(options.radiusKm, undefined)
  assert.ok(options.candidateRadiusMeters > 46044 && options.candidateRadiusMeters < 46046)
  for (const regionalBounds of [bounds, { west: -74.01, south: 40.70, east: -73.99, north: 40.72 }]) {
    assert.ok(parsePetMapQuery(regionalBounds).candidateRadiusMeters <= 50000)
  }
})

test('viewport membership uses only public cells before complete deterministic pagination', () => {
  for (const requester of [undefined, { _id: new mongoose.Types.ObjectId() }, { _id: new mongoose.Types.ObjectId(), role: 'shelter_admin' }]) {
    const options = parsePetMapQuery({ ...bounds, page: 2 }, requester)
    const pipeline = petMapPipeline(options)
    assert.equal(pipeline[0].$geoNear.maxDistance, options.candidateRadiusMeters)
    assert.deepEqual(pipeline[0].$geoNear.query.status, { $in: ['lost', 'sighted'] })
    assert.deepEqual(pipeline[0].$geoNear.query.moderationStatus, { $ne: 'hidden' })
    assert.equal(pipeline.slice(0, -1).some(stage => '$limit' in stage || '$skip' in stage), false)
    const membership = JSON.stringify(pipeline[2])
    assert.ok(membership.includes('$publicCell.x') && membership.includes('$publicCell.y'))
    assert.equal(membership.includes('$location'), false)
    assert.equal(membership.includes('internalDistance'), false)
    assert.deepEqual(pipeline.at(-1).$facet.markers, [{ $sort: { _id: 1 } }, { $skip: 100 }, { $limit: 100 }])
    assert.deepEqual(pipeline.at(-1).$facet.totals, [{ $count: 'count' }])
    const payload = publicPetMapResult({ markers: [], totals: [{ count: 815 }] }, options)
    assert.deepEqual(payload.bounds, bounds)
    assert.equal('radiusKm' in payload, false)
    assert.deepEqual(payload.pagination, { page: 2, limit: 100, total: 815, totalPages: 9, hasMore: true })
  }
})

test('map validates resource bounds, snaps every role, and never caps sources before public membership', () => {
  for (const extra of [{ lat: '' }, { lng: '181' }, { lat: '91' }, { radiusKm: '0.9' }, { radiusKm: '51' }, { limit: '101' }, { page: '1.5' }, { page: '10001' }, { species: 'unknown' }, { district: 'unknown' }, { lat: ['22', '23'] }]) {
    assert.throws(() => parsePetMapQuery({ ...query, ...extra }), { code: 'MAP_QUERY_INVALID' })
  }
  for (const requester of [undefined, { _id: new mongoose.Types.ObjectId() }, { _id: new mongoose.Types.ObjectId(), role: 'shelter_admin' }]) {
    const options = parsePetMapQuery(query, requester)
    assert.deepEqual([options.longitude, options.latitude], approximateCoordinates([114.188123, 22.381456]))
    const pipeline = petMapPipeline(options)
    assert.deepEqual(pipeline[0].$geoNear.query.status, { $in: ['lost', 'sighted'] })
    assert.deepEqual(pipeline[0].$geoNear.query.moderationStatus, { $ne: 'hidden' })
    assert.equal(pipeline.slice(0, -1).some(stage => '$limit' in stage || '$skip' in stage), false)
    assert.ok(pipeline[2].$match.$expr)
    assert.deepEqual(pipeline.at(-1).$facet.markers, [{ $sort: { _id: 1 } }, { $skip: 0 }, { $limit: 100 }])
    assert.deepEqual(pipeline.at(-1).$facet.totals, [{ $count: 'count' }])
  }
  assert.deepEqual(PET_MAP_QUERY_OPTIONS, { maxTimeMS: 10000, allowDiskUse: false })
})

test('map DTO explicitly omits contact, exact location, moderation and derived-distance fields', () => {
  const id = new mongoose.Types.ObjectId()
  const payload = publicPetMapResult({ markers: [{ _id: id, name: 'Synthetic pet', species: 'Dog', status: 'sighted', publicCell: { x: 10, y: 20 }, photo: '', photos: ['/api/media/fixture'], ownerPhone: 'PRIVATE', locationName: 'PRIVATE', internalDistance: 123, location: { coordinates: [1, 2] }, moderationReason: 'PRIVATE', reportedBy: 'PRIVATE' }], totals: [{ count: 151 }] }, { page: 2, limit: 100, radiusKm: 20 })
  assert.deepEqual(payload.markers[0], { id: String(id), name: 'Synthetic pet', species: 'Dog', breed: '', status: 'sighted', district: '', photo: '/api/media/fixture', coordinates: publicCellCentre(10, 20), locationPrecision: 'approximate', locationSource: 'stored_report' })
  assert.deepEqual(payload.pagination, { page: 2, limit: 100, total: 151, totalPages: 2, hasMore: false })
  assert.equal(JSON.stringify(payload).includes('PRIVATE'), false)
})

test('actual map route/auth middleware: guest, owner, reporter, unrelated and shelter roles receive public-only DTOs', async () => {
  // Real Express routing/JWT middleware; database lookup/aggregation are mocks.
  const oldSecret = process.env.JWT_SECRET, oldFind = User.findById, oldAggregate = Pet.aggregate
  const secret = randomBytes(48).toString('hex')
  const users = ['owner', 'reporter', 'unrelated', 'shelter_admin'].map(role => ({ _id: new mongoose.Types.ObjectId(), role }))
  let captured, calls = 0
  const marker = { _id: new mongoose.Types.ObjectId(), name: 'Emergency discovery', species: 'Cat', status: 'lost', publicCell: { x: 1, y: 2 }, ownerPhone: 'PRIVATE' }
  process.env.JWT_SECRET = secret
  User.findById = async id => users.find(user => String(user._id) === String(id))
  Pet.aggregate = async (pipeline, options) => { captured = pipeline; calls++; assert.deepEqual(options, PET_MAP_QUERY_OPTIONS); return [{ markers: [marker], totals: [{ count: 1 }] }] }
  const app = express(); app.use('/api/pets', petsRouter)
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/pets/map`
    for (const user of [undefined, ...users]) {
      const headers = user ? { authorization: `Bearer ${jwt.sign({ id: String(user._id) }, secret)}` } : {}
      const response = await fetch(`${base}?${new URLSearchParams(query)}`, { headers })
      assert.equal(response.status, 200)
      assert.match(response.headers.get('cache-control'), /no-store/)
      const payload = await response.json()
      assert.equal(payload.markers[0].locationPrecision, 'approximate')
      assert.equal(payload.markers[0].id, String(marker._id))
      assert.equal(JSON.stringify(payload).includes('PRIVATE'), false)
      const filter = captured[0].$geoNear.query
      if (user) assert.equal(String(filter.reportedBy.$ne), String(user._id))
      else assert.equal(filter.reportedBy, undefined)
      // Block/contact relations intentionally do not suppress emergency discovery.
      assert.deepEqual(Object.keys(filter).sort(), user ? ['moderationStatus', 'reportedBy', 'status'] : ['moderationStatus', 'status'])
      const viewportResponse = await fetch(`${base}?${new URLSearchParams(bounds)}`, { headers })
      assert.equal(viewportResponse.status, 200)
      const viewportPayload = await viewportResponse.json()
      assert.deepEqual(viewportPayload.bounds, bounds)
      assert.equal('radiusKm' in viewportPayload, false)
      assert.deepEqual(viewportPayload.markers, payload.markers)
      assert.equal(JSON.stringify(viewportPayload).includes('PRIVATE'), false)
      if (user) assert.equal(String(captured[0].$geoNear.query.reportedBy.$ne), String(user._id))
      else assert.equal(captured[0].$geoNear.query.reportedBy, undefined)
    }
    const before = calls
    // A static /map without required coordinates must hit map validation,
    // never the /:id controller's "Invalid pet id" response.
    const missingQuery = await fetch(base)
    assert.equal(missingQuery.status, 400)
    assert.equal((await missingQuery.json()).code, 'MAP_QUERY_INVALID')
    const invalid = await fetch(`${base}?lng=114&lat=22&limit=101`)
    assert.equal(invalid.status, 400); assert.equal((await invalid.json()).code, 'MAP_QUERY_INVALID'); assert.equal(calls, before)
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
    User.findById = oldFind; Pet.aggregate = oldAggregate
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret
  }
})
