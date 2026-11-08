import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import { smartMatch } from '../controllers/petController.js'
import { loadKit, rankScenario } from '../scripts/evaluateSmartMatch.js'

test('all 12 fixture rankings, breakdowns, eligibility and limits match the actual controller with mocked persistence', async t => {
  const kit = loadKit()
  const originalFind = Pet.find, originalAggregate = Sighting.aggregate
  const records = kit.reports.map(report => ({ ...report, _id: report.id }))
  let finds = 0, aggregates = 0
  assert.equal(mongoose.connection.readyState, 0)
  t.mock.timers.enable({ apis: ['Date'], now: kit.now.getTime() })
  try {
    Pet.find = async query => {
      finds++
      assert.deepEqual(query, { species: query.species, status: { $in: ['lost', 'sighted'] }, moderationStatus: { $ne: 'hidden' } })
      // Interpret the actual query rather than calling the evaluator's filter.
      return records.filter(record => record.species === query.species && query.status.$in.includes(record.status) && record.moderationStatus !== query.moderationStatus.$ne)
    }
    Sighting.aggregate = async pipeline => {
      aggregates++
      assert.equal(pipeline[0].$match.moderationStatus.$ne, 'hidden')
      return []
    }
    for (const scenario of kit.scenarios) {
      for (const limit of [1, 3, 20, 50]) {
        let payload
        const response = { set() {}, json(value) { payload = value } }
        await smartMatch({ body: { species: scenario.species, breed: scenario.breed, coordinates: scenario.coordinates, limit } }, response, error => { throw error })
        const actual = payload.matches.map(({ id, totalScore, breakdown }) => ({ id, totalScore, breakdown }))
        const expected = rankScenario(kit.reports, scenario, kit.now, limit).smartMatch
        assert.deepEqual(actual, expected, `${scenario.id} limit ${limit}`)
        assert.ok(actual.every(result => !Object.hasOwn(result.breakdown, 'distanceKm')))
      }
    }
    assert.equal(finds, 48)
    assert.equal(aggregates, 48) // grouped count, not per-candidate calls
    assert.equal(mongoose.connection.readyState, 0)
  } finally {
    Pet.find = originalFind; Sighting.aggregate = originalAggregate
    t.mock.timers.reset()
  }
})
