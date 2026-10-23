import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import Stray from '../models/Stray.js'
import { listHotspots } from '../controllers/analyticsController.js'
import { aggregateHotspotCells, hotspotPipeline, publicHotspotResult, sightingIntensity, strayIntensity, MAX_HOTSPOT_CELLS, HOTSPOT_QUERY_OPTIONS } from '../services/hotspotAnalytics.js'
import { approximateCoordinates, publicCellCentre, EARTH_RADIUS_METERS } from '../services/locationPrivacy.js'
import { openTransactionDatabase } from './helpers/localTransactions.js'

const uri = process.env.MEDIA_TEST_MONGODB_URI
const NOW = new Date('2026-10-20T04:00:00Z')
const DAY = 86400000
const centre = approximateCoordinates([114.188123, 22.381456])
const point = (coordinates) => ({ type: 'Point', coordinates })
const options = (coordinates = centre, radiusKm = 50) => ({ longitude: coordinates[0], latitude: coordinates[1], radiusKm, windowDays: 30, now: NOW, since: new Date(+NOW - 30 * DAY) })
const cellIndex = ([lng, lat]) => [
  Math.floor(EARTH_RADIUS_METERS * lng * Math.PI / 180 / 750),
  Math.floor(EARTH_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / 750),
]
const rawCentre = (x, y) => [
  (x + 0.5) * 750 / EARTH_RADIUS_METERS * 180 / Math.PI,
  (2 * Math.atan(Math.exp((y + 0.5) * 750 / EARTH_RADIUS_METERS)) - Math.PI / 2) * 180 / Math.PI,
]
function distanceMeters([lng1, lat1], [lng2, lat2]) {
  const radians = Math.PI / 180
  const h = Math.sin((lat2 - lat1) * radians / 2) ** 2 +
    Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin((lng2 - lng1) * radians / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, h)))
}

test('real MongoDB geospatial hotspots count every eligible record before deterministic cell limits', {
  skip: !uri ? 'Dedicated local replica set required; application databases prohibited.' : false, timeout: 120000,
}, async (t) => {
  const { connection } = await openTransactionDatabase(uri, 'analytics', t)
  const models = new Map(), ledger = new Map(), originals = []
  const insert = async (Global, values) => {
    const rows = values.map(value => ({ _id: new mongoose.Types.ObjectId(), ...value }))
    ledger.get(Global).push(...rows.map(row => row._id))
    if (rows.length) await models.get(Global).collection.insertMany(rows)
    return rows
  }
  const eraseFixtures = async () => {
    for (const [Global, Local] of models) {
      const ids = ledger.get(Global)
      await Local.deleteMany({ _id: { $in: ids } })
      assert.equal(await Local.countDocuments({ _id: { $in: ids } }), 0)
      ledger.set(Global, [])
    }
  }
  const execute = async (source, settings = options()) => {
    const Global = source === 'strays' ? Stray : Sighting
    const [result] = await models.get(Global).aggregate(hotspotPipeline(source, settings), HOTSPOT_QUERY_OPTIONS)
    return publicHotspotResult(result)
  }
  const sight = (pet, coordinates = centre, extra = {}) => ({ pet, location: point(coordinates), locationName: 'PRIVATE_PLACE', reporterPhone: 'PRIVATE_PHONE', note: 'PRIVATE_NOTE', createdAt: NOW, confirmedBy: [], ...extra })
  const stray = (coordinates = centre, extra = {}) => ({ location: point(coordinates), createdAt: NOW, condition: 'healthy', rescueStatus: 'reported', reporterPhone: 'PRIVATE_PHONE', description: 'PRIVATE_POST', ...extra })
  try {
    for (const Global of [Pet, Sighting, Stray]) {
      const Local = connection.model(Global.modelName, Global.schema.clone())
      models.set(Global, Local); ledger.set(Global, [])
      await Local.createCollection(); await Local.createIndexes()
      const original = Global.aggregate; originals.push(() => { Global.aggregate = original })
      Global.aggregate = (...args) => Local.aggregate(...args)
    }

    await t.test('more than 750 records per source, distant dense cells, visibility, legacy and time/radius filters', async () => {
      const [visible, hidden] = await insert(Pet, [{ name: 'Synthetic public parent' }, { moderationStatus: 'hidden' }])
      const far = [centre[0] + 0.035, centre[1] + 0.025]
      const sightings = [...Array.from({ length: 800 }, () => sight(visible._id)), ...Array.from({ length: 60 }, () => sight(visible._id, far))]
      const strays = [...Array.from({ length: 810 }, () => stray()), ...Array.from({ length: 55 }, () => stray(far, { active: true }))]
      await insert(Sighting, [...sightings, sight(hidden._id), sight(new mongoose.Types.ObjectId()), sight(visible._id, centre, { moderationStatus: 'hidden' }), sight(visible._id, [115.5, 22.3]), sight(visible._id, centre, { createdAt: new Date(+NOW - 30 * DAY - 1) })])
      await insert(Stray, [...strays, stray(centre, { active: false }), stray(centre, { moderationStatus: 'hidden' }), stray([115.5, 22.3]), stray(centre, { createdAt: new Date(+NOW - 30 * DAY - 1) })])
      const result = await execute('all')
      assert.deepEqual(result.cells, aggregateHotspotCells({ sightings, strays }, 30, NOW))
      assert.equal(result.summary.total, 1725)
      assert.equal(result.summary.sightings, 860)
      assert.equal(result.summary.strays, 865)
      assert.equal(result.summary.cellCount, 2)
      assert.equal(result.summary.cellsTruncated, false)
      assert.equal(result.cells[1].count, 115) // Former nearest-record limit dropped this whole cell.
      for (const source of ['sightings', 'strays']) {
        const only = await execute(source)
        assert.equal(only.summary.total, source === 'sightings' ? 860 : 865)
        assert.equal(only.summary[source === 'sightings' ? 'strays' : 'sightings'], 0)
      }
      // Actual controller + actual database, recursively strict public allowlists.
      let payload
      await listHotspots({ query: { lng: String(centre[0]), lat: String(centre[1]), radiusKm: '50', days: '365' } }, { set() {}, json(body) { payload = body } }, error => { throw error })
      assert.deepEqual(Object.keys(payload).sort(), ['cells', 'summary'])
      for (const cell of payload.cells) {
        assert.deepEqual(Object.keys(cell).sort(), ['coordinates', 'count', 'intensity', 'locationPrecision', 'sightingCount', 'strayCount'])
        assert.notDeepEqual(cell.coordinates, far)
        assert.equal(cell.locationPrecision, 'approximate')
      }
      const serialized = JSON.stringify(payload)
      for (const forbidden of ['PRIVATE', '_id', 'reportedBy', 'reporterPhone', 'createdAt', 'distanceMeters', 'weightUnits', String(visible._id), String(hidden._id)]) assert.equal(serialized.includes(forbidden), false)
      assert.deepEqual(Object.keys(payload.summary).sort(), ['total', 'cellCount', 'sightings', 'strays', 'returnedCellCount', 'returnedTotal', 'cellsTruncated', 'maxCells', 'gridSizeMeters', 'radiusKm', 'windowDays'].sort())
    })

    await t.test('time window is inclusive, out-of-radius is excluded, and recency/urgency match existing JS', async () => {
      await eraseFixtures()
      const [pet] = await insert(Pet, [{}])
      const [x, y] = cellIndex(centre)
      const inside = publicCellCentre(x, y + 1) // Public centre < 1km.
      const outside = publicCellCentre(x, y + 2) // Public centre > 1km.
      const sightings = [sight(pet._id, inside, { createdAt: new Date(+NOW - 30 * DAY), confirmedBy: [pet._id, pet._id] }), sight(pet._id, centre, { createdAt: new Date(+NOW + DAY), confirmedBy: 'legacy-non-array' })]
      const strays = ['healthy', 'unknown', 'injured', 'critical', 'legacy'].flatMap(condition => ['reported', 'rescue_dispatched', 'rescued', 'legacy'].map(rescueStatus => stray(inside, { condition, rescueStatus, createdAt: new Date(+NOW - 15 * DAY) })))
      await insert(Sighting, [...sightings, sight(pet._id, inside, { createdAt: new Date(+NOW - 30 * DAY - 1) }), sight(pet._id, outside)])
      await insert(Stray, [...strays, stray(outside), stray(inside, { createdAt: new Date(+NOW - 30 * DAY - 1) })])
      const actual = await execute('all', options(centre, 1))
      assert.equal(actual.summary.total, 22)
      assert.deepEqual(actual.cells, aggregateHotspotCells({ sightings, strays }, 30, NOW))
      // Radius boundaries now refer only to deterministic public cell centres.
      const boundaryMeters = distanceMeters(centre, rawCentre(x, y + 1))
      for (const [delta, expected] of [[-0.001, 1], [0.001, 2]]) {
        const boundary = await execute('sightings', options(centre, (boundaryMeters + delta) / 1000))
        assert.equal(boundary.summary.total, expected)
      }
    })

    await t.test('moving exact locations within public cells cannot change membership, weights, order or metadata', async () => {
      await eraseFixtures()
      const [pet, hiddenPet] = await insert(Pet, [{}, { moderationStatus: 'hidden' }])
      const [x, y] = cellIndex(centre)
      const locations = [rawCentre(x, y), rawCentre(x + 4, y + 2)]
      const sightings = await insert(Sighting, [
        sight(pet._id, locations[0], { confirmedBy: [pet._id], createdAt: new Date(+NOW - DAY) }),
        sight(pet._id, locations[1], { confirmedBy: [pet._id, pet._id] }),
        sight(hiddenPet._id, locations[0]), sight(pet._id, locations[0], { moderationStatus: 'hidden' }),
      ])
      const strays = await insert(Stray, [
        stray(locations[0], { condition: 'critical' }), stray(locations[1], { active: true }),
        stray(locations[0], { active: false }), stray(locations[1], { moderationStatus: 'hidden' }),
      ])
      const origins = [publicCellCentre(x - 5, y - 5), publicCellCentre(x - 5, y + 5), publicCellCentre(x + 5, y)]
      const queries = origins.flatMap(origin => [
        ...locations.flatMap(location => {
          const boundary = distanceMeters(origin, location) / 1000
          return [-0.000001, 0.000001].map(delta => options(origin, boundary + delta))
        }), options(origin, 1), options(origin, 50),
      ])
      const baseline = await Promise.all(queries.map(settings => execute('all', settings)))
      const move = async (dx, dy) => {
        for (const [Global, rows] of [[Sighting, sightings], [Stray, strays]]) {
          await models.get(Global).bulkWrite(rows.map(row => ({ updateOne: {
            filter: { _id: row._id },
            update: { $set: { location: point([row.location.coordinates[0] + dx, row.location.coordinates[1] + dy]) } },
          } })))
        }
      }
      for (const [dx, dy] of [[-0.0025, -0.0025], [0.0025, 0.0025]]) {
        for (const location of locations) assert.deepEqual(approximateCoordinates([location[0] + dx, location[1] + dy]), approximateCoordinates(location))
        await move(dx, dy)
        for (const [index, settings] of queries.entries()) assert.deepEqual(await execute('all', settings), baseline[index])
      }
      assert.ok(baseline.some(result => result.summary.total === 4))
      assert.ok(baseline.some(result => result.summary.total === 0))
      // Real controller response, fixed clock, same source movement and all roles.
      t.mock.timers.enable({ apis: ['Date'], now: NOW })
      try {
        for (const user of [undefined, { role: 'user', _id: pet._id }, { role: 'shelter_admin', _id: pet._id }]) {
          for (const settings of queries) {
            const call = async () => {
              let payload
              await listHotspots({ user, query: { source: 'all', lng: String(settings.longitude), lat: String(settings.latitude), radiusKm: String(settings.radiusKm), days: '30' } },
                { set() {}, json(body) { payload = body } }, error => { throw error })
              return payload
            }
            await move(-0.0025, -0.0025); const before = await call()
            await move(0.0025, 0.0025); assert.deepEqual(await call(), before)
            assert.equal(/PRIVATE|distanceMeters|weightUnits|reportedBy|createdAt/.test(JSON.stringify(before)), false)
          }
        }
      } finally { t.mock.timers.reset() }
    })

    await t.test('mixed-source merging precedes global output limiting, ties are stable and totals stay complete', async () => {
      await eraseFixtures()
      const [pet] = await insert(Pet, [{}])
      const baseX = Math.floor(EARTH_RADIUS_METERS * (centre[0] * Math.PI / 180) / 750)
      // 1,600 distinct cells within the 50km radius; total counts are not sampled.
      const coordinates = Array.from({ length: 1600 }, (_, index) => publicCellCentre(baseX + index % 40 - 20, 3400 + Math.floor(index / 40)))
      const sightings = coordinates.map(coords => sight(pet._id, coords))
      const strays = coordinates.map(coords => stray(coords))
      // Source leaders: 4+1 and 1+4; the merged winner is instead 3+3.
      sightings.push(sight(pet._id, coordinates[0]), sight(pet._id, coordinates[0]), sight(pet._id, coordinates[0]), sight(pet._id, coordinates[2]), sight(pet._id, coordinates[2]))
      strays.push(stray(coordinates[1]), stray(coordinates[1]), stray(coordinates[1]), stray(coordinates[2]), stray(coordinates[2]))
      await insert(Sighting, [...sightings].reverse()); await insert(Stray, strays)
      const expected = aggregateHotspotCells({ sightings, strays }, 30, NOW)
      const result = await execute('all')
      assert.equal(expected.length, 1600)
      assert.equal(result.summary.total, 3210)
      assert.equal(result.summary.cellCount, 1600)
      assert.equal(result.cells.length, MAX_HOTSPOT_CELLS)
      assert.equal(result.summary.returnedCellCount, 1500)
      assert.equal(result.summary.returnedTotal, 3010)
      assert.equal(result.summary.cellsTruncated, true)
      assert.deepEqual(result.cells, expected.slice(0, MAX_HOTSPOT_CELLS))
      assert.deepEqual((await execute('all')).cells, result.cells)
      assert.deepEqual(result.cells[0].coordinates, approximateCoordinates(coordinates[2]))
      assert.equal(result.cells[0].count, 6)
      // Even capped output and complete summary must be invariant to within-cell
      // movements across every source, not merely the returned first page.
      for (const Global of [Sighting, Stray]) {
        await models.get(Global).updateMany({ _id: { $in: ledger.get(Global) } }, [{
          $set: { 'location.coordinates': [
            { $add: [{ $arrayElemAt: ['$location.coordinates', 0] }, 0.001] },
            { $add: [{ $arrayElemAt: ['$location.coordinates', 1] }, -0.001] },
          ] },
        }])
      }
      assert.deepEqual(await execute('all'), result)
    })

    await t.test('individual non-saturated cells preserve every confirmation, urgency, status and recency weight', async () => {
      await eraseFixtures()
      const [pet] = await insert(Pet, [{}])
      const sightings = [], strays = []
      let index = 0
      const next = () => publicCellCentre(16940 + index % 10, 3400 + Math.floor(index++ / 10))
      for (const age of [-DAY, 0, DAY / 7, 7 * DAY, 15 * DAY, 30 * DAY]) {
        for (const confirmations of [0, 1, 4, 6]) sightings.push(sight(pet._id, next(), { createdAt: new Date(+NOW - age), confirmedBy: Array(confirmations).fill(pet._id) }))
        for (const condition of ['healthy', 'unknown', 'injured', 'critical', 'legacy']) {
          for (const rescueStatus of ['reported', 'rescue_dispatched', 'rescued', 'legacy']) strays.push(stray(next(), { condition, rescueStatus, createdAt: new Date(+NOW - age) }))
        }
      }
      await insert(Sighting, sightings); await insert(Stray, strays)
      const [raw] = await models.get(Sighting).aggregate(hotspotPipeline('all', options()), HOTSPOT_QUERY_OPTIONS)
      const expectedUnits = new Map([
        ...sightings.map(row => [approximateCoordinates(row.location.coordinates).join(','), Math.round(sightingIntensity(row, 30, NOW) * 100)]),
        ...strays.map(row => [approximateCoordinates(row.location.coordinates).join(','), Math.round(strayIntensity(row, 30, NOW) * 100)]),
      ])
      assert.equal(raw.cells.length, sightings.length + strays.length)
      for (const cell of raw.cells) {
        assert.equal(cell.count, 1)
        assert.equal(cell.weightUnits, expectedUnits.get(publicCellCentre(cell._id.x, cell._id.y).join(',')))
      }
      assert.deepEqual(publicHotspotResult(raw).cells, aggregateHotspotCells({ sightings, strays }, 30, NOW))
    })

    await t.test('real Mongo grid math agrees with public projection at zero, signed boundaries and Mercator clamps', async () => {
      await eraseFixtures()
      const [pet] = await insert(Pet, [{}])
      const edge = 750 / EARTH_RADIUS_METERS * 180 / Math.PI
      const latEdge = (2 * Math.atan(Math.exp(750 / EARTH_RADIUS_METERS)) - Math.PI / 2) * 180 / Math.PI
      for (const coords of [[0, 0], [1e-10, 1e-10], [-1e-10, -1e-10], [edge, 0.01], [edge - 1e-10, 0.01], [edge + 1e-10, 0.01], [-edge, -0.01], [-edge - 1e-10, -0.01], [-edge + 1e-10, -0.01], [0.01, latEdge], [0.01, latEdge - 1e-10], [0.01, latEdge + 1e-10], [-0.01, -latEdge], [-0.01, -latEdge - 1e-10], [-0.01, -latEdge + 1e-10], [20, 89], [-20, -89], [180, 90], [-180, -90]]) {
        await eraseFixtures()
        // Reinsert a visible parent after exact fixture teardown.
        await insert(Pet, [{ _id: pet._id }])
        const row = sight(pet._id, coords)
        await insert(Sighting, [row])
        const result = await execute('sightings', options(approximateCoordinates(coords), 1))
        assert.equal(result.summary.total, 1)
        assert.deepEqual(result.cells, aggregateHotspotCells({ sightings: [row] }, 30, NOW))
      }
    })
    await t.test('clamped polar points and wrapped longitudes have the same cell membership at radius boundaries', async () => {
      for (const locations of [
        [[20, 85.1], [20, 89.99], [20, 90]],
        [[-20, -85.1], [-20, -89.99], [-20, -90]],
        [[179.999, 22.3], [180, 22.3]],
        [[-180, -22.3], [-179.999, -22.3]],
      ]) {
        await eraseFixtures()
        const [row] = await insert(Stray, [stray(locations[0])])
        const publicPoint = approximateCoordinates(locations[0])
        for (const location of locations) assert.deepEqual(approximateCoordinates(location), publicPoint)
        const target = rawCentre(...cellIndex(publicPoint))
        for (const origin of [publicPoint, [publicPoint[0] - 0.2, publicPoint[1] - 0.02], [publicPoint[0] + 0.2, publicPoint[1] + 0.02]]) {
          const boundary = distanceMeters(origin, target) / 1000
          const radii = [1, 50, ...[-0.000001, 0.000001].map(delta => Math.max(0.000001, boundary + delta))]
          for (const radius of radii) {
            let baseline
            for (const location of locations) {
              await models.get(Stray).updateOne({ _id: row._id }, { $set: { location: point(location) } })
              const result = await execute('strays', options(origin, radius))
              if (baseline) assert.deepEqual(result, baseline)
              else baseline = result
              assert.equal(result.summary.total, distanceMeters(origin, target) <= radius * 1000 ? 1 : 0)
            }
          }
        }
      }
    })
  } finally {
    await eraseFixtures()
    originals.reverse().forEach(restore => restore())
    await connection.close()
    t.diagnostic('Exact isolated analytics fixture teardown verified; no Atlas or provider access.')
  }
})
