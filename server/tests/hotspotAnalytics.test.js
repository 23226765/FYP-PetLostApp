import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregateHotspotCells,
  PUBLIC_GRID_SIZE_METERS,
  recencyFactor,
  sightingIntensity,
  strayIntensity,
} from '../services/hotspotAnalytics.js'
import { listHotspots } from '../controllers/analyticsController.js'
import Sighting from '../models/Sighting.js'
import Stray from '../models/Stray.js'

const NOW = new Date('2026-09-16T12:00:00.000Z')

test('hotspot recency decays linearly across the requested analysis window', () => {
  assert.equal(recencyFactor(NOW, 30, NOW), 1)
  assert.equal(recencyFactor(new Date('2026-09-01T12:00:00.000Z'), 30, NOW), 0.5)
  assert.equal(recencyFactor(new Date('2026-08-01T12:00:00.000Z'), 30, NOW), 0)
})

test('community confirmations increase sighting hotspot intensity', () => {
  const unconfirmed = sightingIntensity({ createdAt: NOW, confirmedBy: [] }, 30, NOW)
  const confirmed = sightingIntensity(
    { createdAt: NOW, confirmedBy: ['1', '2', '3', '4'] },
    30,
    NOW,
  )

  assert.equal(unconfirmed, 0.55)
  assert.equal(confirmed, 0.87)
})

test('critical unresolved strays carry more heat than rescued healthy reports', () => {
  const critical = strayIntensity(
    { condition: 'critical', rescueStatus: 'reported', createdAt: NOW },
    30,
    NOW,
  )
  const rescued = strayIntensity(
    { condition: 'healthy', rescueStatus: 'rescued', createdAt: NOW },
    30,
    NOW,
  )

  assert.equal(critical, 1)
  assert.equal(rescued, 0.2)
})

test('hotspot aggregation merges records in one deterministic 750 metre cell', () => {
  const firstLocation = { type: 'Point', coordinates: [114.188123, 22.381456] }
  const sameCellLocation = { type: 'Point', coordinates: [114.1882, 22.3815] }
  const distantLocation = { type: 'Point', coordinates: [114.215, 22.405] }
  const cells = aggregateHotspotCells(
    {
      sightings: [
        { location: firstLocation, createdAt: NOW, confirmedBy: [] },
        { location: sameCellLocation, createdAt: NOW, confirmedBy: ['one'] },
      ],
      strays: [
        {
          location: sameCellLocation,
          createdAt: NOW,
          condition: 'injured',
          rescueStatus: 'reported',
        },
        {
          location: distantLocation,
          createdAt: NOW,
          condition: 'healthy',
          rescueStatus: 'rescued',
        },
      ],
    },
    30,
    NOW,
  )

  assert.equal(PUBLIC_GRID_SIZE_METERS, 750)
  assert.equal(cells.length, 2)
  assert.deepEqual(
    cells.map((cell) => cell.count).sort((left, right) => right - left),
    [3, 1],
  )
  const denseCell = cells.find((cell) => cell.count === 3)
  const sparseCell = cells.find((cell) => cell.count === 1)
  assert.equal(denseCell.locationPrecision, 'approximate')
  assert.equal(denseCell.sightingCount, 2)
  assert.equal(denseCell.strayCount, 1)
  assert.notDeepEqual(denseCell.coordinates, firstLocation.coordinates)
  assert.ok(denseCell.intensity > sparseCell.intensity)
})

test('hotspot aggregation is stable across input order and ignores invalid coordinates', () => {
  const reports = [
    { location: { type: 'Point', coordinates: [114.16, 22.28] }, createdAt: NOW },
    { location: { type: 'Point', coordinates: [114.17, 22.29] }, createdAt: NOW },
    { location: { type: 'Point', coordinates: ['invalid', 22.3] }, createdAt: NOW },
  ]
  const forward = aggregateHotspotCells({ sightings: reports }, 30, NOW)
  const reversed = aggregateHotspotCells({ sightings: [...reports].reverse() }, 30, NOW)
  assert.deepEqual(forward, reversed)
  assert.equal(forward.reduce((total, cell) => total + cell.count, 0), 2)
})

test('hotspot endpoint rejects invalid coordinates before querying the database', async () => {
  let statusCode = 200
  let payload
  const response = {
    status(code) {
      statusCode = code
      return this
    },
    json(body) {
      payload = body
      return this
    },
  }

  await listHotspots(
    { query: { lat: 'not-a-coordinate', lng: '114.1694' } },
    response,
    (error) => { throw error },
  )

  assert.equal(statusCode, 400)
  assert.match(payload.error, /valid coordinates/)
})

test('hotspot endpoint returns only public cells and complete totals from globally grouped results', async (t) => {
  const grouped = [{ cells: [{ _id: { x: 16948, y: 3410 }, count: 1701, sightingCount: 850, strayCount: 851, weightUnits: 90000, phone: 'PRIVATE_PHONE', reportId: 'PRIVATE_ID' }], summary: [{ total: 1701, cellCount: 1, sightings: 850, strays: 851, internal: 'PRIVATE_DETAIL' }] }]
  const aggregate = t.mock.method(Sighting, 'aggregate', async () => grouped)
  t.mock.method(Stray, 'aggregate', () => { throw new Error('all sources must use a single union pipeline') })
  for (const user of [undefined, { role: 'user', _id: 'owner' }, { role: 'user', _id: 'reporter' }, { role: 'user', _id: 'unrelated' }, { role: 'shelter_admin', _id: 'admin' }]) {
    let payload
    const res = { set() { return this }, json(body) { payload = body } }
    await listHotspots({ user, query: { lat: '22.381', lng: '114.188', radiusKm: '5', source: 'all' } }, res, error => { throw error })
    assert.equal(payload.cells[0].count, 1701)
    assert.equal(payload.summary.total, 1701)
    assert.equal(payload.summary.returnedTotal, 1701)
    assert.equal(payload.summary.cellsTruncated, false)
    assert.equal(payload.summary.maxCells, 1500)
    assert.deepEqual(Object.keys(payload.cells[0]).sort(), ['coordinates', 'count', 'intensity', 'locationPrecision', 'sightingCount', 'strayCount'])
    assert.equal(JSON.stringify(payload).includes('PRIVATE'), false)
  }
  const [pipeline, options] = aggregate.mock.calls[0].arguments
  assert.deepEqual(options, { maxTimeMS: 10000, allowDiskUse: false })
  const other = pipeline.find(stage => stage.$unionWith).$unionWith.pipeline
  assert.equal(pipeline[0].$geoNear.query.moderationStatus.$ne, 'hidden')
  assert.equal(other[0].$geoNear.query.active.$ne, false)
  assert.equal(other[0].$geoNear.query.moderationStatus.$ne, 'hidden')
  assert.ok(pipeline[0].$geoNear.query.createdAt.$gte instanceof Date)
  assert.ok(pipeline.some(stage => stage.$match?.['parentPet.0']?.$exists === true))
  for (const stages of [pipeline, other]) {
    assert.ok(stages.some(stage => stage.$group))
    assert.equal(stages.some(stage => stage.$limit || stage.$sample), false)
  }
  assert.deepEqual(pipeline.at(-1).$facet.cells, [{ $sort: { count: -1, '_id.x': 1, '_id.y': 1 } }, { $limit: 1500 }])
  assert.equal(pipeline.at(-1).$facet.summary.some(stage => stage.$limit), false)
})

test('source selection, bounded validation and empty totals remain consistent', async (t) => {
  const sightings = t.mock.method(Sighting, 'aggregate', async () => [{ cells: [], summary: [] }])
  const strays = t.mock.method(Stray, 'aggregate', async () => [{ cells: [], summary: [] }])
  for (const [source, radiusKm, days, expectedRadius, expectedDays] of [
    ['sightings', '-1', '0', 1, 1], ['strays', '100', '500', 50, 365], ['all', 'bad', 'bad', 20, 30],
  ]) {
    let payload
    await listHotspots({ query: { lat: '22.3', lng: '114.1', source, radiusKm, days } }, { set() {}, json(body) { payload = body } }, error => { throw error })
    assert.equal(payload.summary.total, 0)
    assert.equal(payload.summary.cellCount, 0)
    assert.equal(payload.summary.returnedCellCount, 0)
    assert.equal(payload.summary.cellsTruncated, false)
    assert.equal(payload.summary.radiusKm, expectedRadius)
    assert.equal(payload.summary.windowDays, expectedDays)
  }
  assert.equal(sightings.mock.callCount(), 2)
  assert.equal(strays.mock.callCount(), 1)
  assert.equal(strays.mock.calls[0].arguments[0].some(stage => stage.$unionWith), false)
})

test('invalid source is rejected without any query, and resource failures never return partial totals', async (t) => {
  const aggregate = t.mock.method(Sighting, 'aggregate', async () => { throw Object.assign(new Error('timeout'), { code: 50 }) })
  let status, payload, failure
  const res = { set() {}, status(code) { status = code; return this }, json(body) { payload = body } }
  await listHotspots({ query: { lat: '22.3', lng: '114.1', source: 'individual-records' } }, res, error => { throw error })
  assert.equal(status, 400)
  assert.equal(aggregate.mock.callCount(), 0)
  payload = undefined
  await listHotspots({ query: { lat: '22.3', lng: '114.1' } }, res, error => { failure = error })
  assert.equal(failure.code, 50)
  assert.equal(payload, undefined)
})
