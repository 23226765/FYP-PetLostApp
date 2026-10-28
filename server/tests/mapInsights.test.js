import test from 'node:test'
import assert from 'node:assert/strict'
import { publicMapInsights } from '../services/mapInsights.js'
import { parsePetMapQuery, petMapPipeline, publicPetMapResult } from '../services/petMapQuery.js'
const now = new Date('2026-10-28T12:00:00Z')
const bounds = { west: 113.82, south: 22.15, east: 114.50, north: 22.57 }
test('insights share the public membership stream and are never limited by marker pagination', () => {
  const pipeline = petMapPipeline(parsePetMapQuery({ ...bounds, page: 2, limit: 1 }), now)
  const facet = pipeline.at(-1).$facet
  assert.ok(facet.statistics && facet.districtCounts)
  assert.equal(pipeline.slice(0, -1).some(stage => stage.$limit || stage.$skip || stage.$lookup || stage.$unwind), false)
  assert.deepEqual(facet.markers.slice(-2), [{ $skip: 1 }, { $limit: 1 }])
  assert.equal(facet.statistics.some(stage => stage.$limit || stage.$skip), false)
  const legacy = petMapPipeline(parsePetMapQuery({ lng: 114.1, lat: 22.3 }), now)
  assert.equal(legacy.at(-1).$facet.statistics, undefined)
  assert.equal('insights' in publicPetMapResult({}, { page: 1, limit: 100, radiusKm: 3 }, now), false)
})
test('unknown districts participate in leadership and ties without returning arbitrary legacy text', () => {
  const stats = { total: 6, dogs: 3, cats: 1, other: 1, unclassifiedSpeciesCount: 1, recentCount: 2, unknownDateCount: 2, futureDateCount: 1 }
  const counts = [{ _id: 'Sha Tin', count: 2 }, { _id: 'Tai Po', count: 2 }, { _id: null, count: 2 }]
  const result = publicMapInsights({ statistics: [stats], districtCounts: counts }, now)
  assert.deepEqual(result.topDistricts, ['Sha Tin', 'Tai Po'])
  assert.equal(result.unknownIsTop, true); assert.equal(result.topDistrictCount, 2)
  assert.deepEqual(result.speciesCounts, { dog: 3, cat: 1, other: 1 })
  assert.equal(result.unclassifiedSpeciesCount, 1)
  assert.equal(result.windowStart, '2026-10-21T12:00:00.000Z')
  assert.equal(result.windowEnd, now.toISOString())
  assert.equal('createdAt' in result, false)
  const unknownWinner = publicMapInsights({ statistics: [stats], districtCounts: [...counts.slice(0, 2), { _id: null, count: 3 }] }, now)
  assert.deepEqual(unknownWinner.topDistricts, []); assert.equal(unknownWinner.unknownIsTop, true)
  const knownTie = publicMapInsights({ statistics: [stats], districtCounts: counts.slice(0, 2) }, now)
  assert.deepEqual(knownTie.topDistricts, ['Sha Tin', 'Tai Po']); assert.equal(knownTie.unknownIsTop, false)
})
test('missing insights are unavailable; an actual empty aggregation is a valid zero result', () => {
  assert.equal(publicMapInsights({}, now), null)
  const empty = publicMapInsights({ statistics: [], districtCounts: [] }, now)
  assert.equal(empty.total, 0); assert.equal(empty.recentCount, 0)
  assert.deepEqual(empty.topDistricts, []); assert.equal(empty.unknownIsTop, false)
  assert.deepEqual(empty.speciesCounts, { dog: 0, cat: 0, other: 0 })
})
