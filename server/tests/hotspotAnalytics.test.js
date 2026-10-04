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

test('hotspot endpoint returns aggregate cells without source identity, timestamps, or exact coordinates', async () => {
  const originalSightingAggregate = Sighting.aggregate
  const originalStrayAggregate = Stray.aggregate
  const exactSighting = [114.188123, 22.381456]
  const exactStray = [114.1882, 22.3815]
  let sightingPipeline
  let strayPipeline
  try {
    Sighting.aggregate = async (pipeline) => {
      sightingPipeline = pipeline
      return [{
      _id: 'private-sighting-id',
      location: { type: 'Point', coordinates: exactSighting },
      createdAt: new Date(),
      confirmedBy: [],
      }]
    }
    Stray.aggregate = async (pipeline) => {
      strayPipeline = pipeline
      return [{
      _id: 'private-stray-id',
      location: { type: 'Point', coordinates: exactStray },
      createdAt: new Date(),
      condition: 'healthy',
      rescueStatus: 'reported',
      }]
    }
    let payload
    const response = {
      set() { return this },
      json(body) { payload = body; return this },
    }
    await listHotspots(
      { query: { lat: '22.381', lng: '114.188', radiusKm: '5', source: 'all' } },
      response,
      (error) => { throw error },
    )

    assert.equal(payload.cells.length, 1)
    assert.equal(payload.cells[0].count, 2)
    assert.equal(payload.cells[0].sightingCount, 1)
    assert.equal(payload.cells[0].strayCount, 1)
    assert.equal(payload.cells[0].locationPrecision, 'approximate')
    assert.notDeepEqual(payload.cells[0].coordinates, exactSighting)
    assert.notDeepEqual(payload.cells[0].coordinates, exactStray)
    assert.deepEqual(payload.summary, {
      total: 2,
      cellCount: 1,
      sightings: 1,
      strays: 1,
      gridSizeMeters: 750,
      radiusKm: 5,
      windowDays: 30,
    })
    assert.equal(sightingPipeline.at(-1).$project._id, 0)
    assert.equal(strayPipeline.at(-1).$project._id, 0)
    assert.deepEqual(sightingPipeline[0].$geoNear.query, {
      moderationStatus: { $ne: 'hidden' },
    })
    assert.deepEqual(strayPipeline[0].$geoNear.query, {
      active: { $ne: false },
      moderationStatus: { $ne: 'hidden' },
    })
    assert.ok(sightingPipeline.some((stage) => stage.$lookup?.from === 'pets'))
    assert.ok(sightingPipeline.some((stage) => stage.$match?.['parentPet.0']?.$exists === true))
    const serialized = JSON.stringify(payload)
    assert.equal(serialized.includes('private-sighting-id'), false)
    assert.equal(serialized.includes('private-stray-id'), false)
    for (const forbidden of ['createdAt', 'occurredAt', 'timestamp', 'locationName', 'confirmedBy']) {
      assert.equal(serialized.includes(forbidden), false)
    }
    for (const cell of payload.cells) {
      assert.deepEqual(Object.keys(cell).sort(), [
        'coordinates',
        'count',
        'intensity',
        'locationPrecision',
        'sightingCount',
        'strayCount',
      ])
    }
  } finally {
    Sighting.aggregate = originalSightingAggregate
    Stray.aggregate = originalStrayAggregate
  }
})

test('inactive and hidden rescue posts never contribute to hotspot cells or summaries', async () => {
  const originalStrayAggregate = Stray.aggregate
  const records = [
    { active: true, moderationStatus: 'visible' },
    {},
    { active: false, moderationStatus: 'visible' },
    { active: true, moderationStatus: 'hidden' },
  ].map((flags, index) => ({
    ...flags,
    location: { type: 'Point', coordinates: [114.188 + index * 0.00001, 22.381] },
    createdAt: NOW,
    condition: 'healthy',
    rescueStatus: 'reported',
  }))
  try {
    Stray.aggregate = async (pipeline) => {
      assert.deepEqual(pipeline[0].$geoNear.query, {
        active: { $ne: false },
        moderationStatus: { $ne: 'hidden' },
      })
      return records.filter((record) =>
        record.active !== false && record.moderationStatus !== 'hidden')
    }
    let payload
    const response = {
      set() { return this },
      json(body) { payload = body; return this },
    }
    await listHotspots(
      { query: { lat: '22.381', lng: '114.188', radiusKm: '5', source: 'strays' } },
      response,
      (error) => { throw error },
    )
    assert.equal(payload.summary.total, 2)
    assert.equal(payload.summary.strays, 2)
    assert.equal(payload.summary.sightings, 0)
    assert.equal(payload.cells.reduce((sum, cell) => sum + cell.strayCount, 0), 2)
  } finally {
    Stray.aggregate = originalStrayAggregate
  }
})

test('hotspot endpoint rejects unsupported sources before querying the database', async () => {
  const originalSightingAggregate = Sighting.aggregate
  const originalStrayAggregate = Stray.aggregate
  let queried = false
  try {
    Sighting.aggregate = async () => { queried = true; return [] }
    Stray.aggregate = async () => { queried = true; return [] }
    let statusCode = 200
    let payload
    const response = {
      set() { return this },
      status(code) { statusCode = code; return this },
      json(body) { payload = body; return this },
    }
    await listHotspots(
      { query: { lat: '22.381', lng: '114.188', source: 'individual-records' } },
      response,
      (error) => { throw error },
    )
    assert.equal(statusCode, 400)
    assert.match(payload.error, /all \| sightings \| strays/)
    assert.equal(queried, false)
  } finally {
    Sighting.aggregate = originalSightingAggregate
    Stray.aggregate = originalStrayAggregate
  }
})

test('hotspot source filter queries and counts only the requested report type', async () => {
  const originalSightingAggregate = Sighting.aggregate
  const originalStrayAggregate = Stray.aggregate
  let sightingQueries = 0
  let strayQueries = 0
  try {
    Sighting.aggregate = async () => {
      sightingQueries += 1
      return [{
        location: { type: 'Point', coordinates: [114.188, 22.381] },
        createdAt: NOW,
        confirmedBy: [],
      }]
    }
    Stray.aggregate = async () => {
      strayQueries += 1
      return []
    }
    let payload
    const response = {
      set() { return this },
      json(body) { payload = body; return this },
    }
    await listHotspots(
      { query: { lat: '22.381', lng: '114.188', source: 'sightings' } },
      response,
      (error) => { throw error },
    )
    assert.equal(sightingQueries, 1)
    assert.equal(strayQueries, 0)
    assert.equal(payload.summary.total, 1)
    assert.equal(payload.summary.sightings, 1)
    assert.equal(payload.summary.strays, 0)
    assert.equal(payload.summary.cellCount, 1)
  } finally {
    Sighting.aggregate = originalSightingAggregate
    Stray.aggregate = originalStrayAggregate
  }
})
