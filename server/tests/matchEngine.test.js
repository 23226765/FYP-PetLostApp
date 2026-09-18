import test from 'node:test'
import assert from 'node:assert/strict'
import {
  breedSimilarity,
  distanceScore,
  recencyScore,
  scoreCandidate,
} from '../services/matchEngine.js'

const NOW = new Date('2026-09-16T12:00:00.000Z')
const ORIGIN = [114.1694, 22.3193]

function candidate(overrides = {}) {
  return {
    species: 'Dog',
    breed: 'Shiba Inu',
    location: { type: 'Point', coordinates: ORIGIN },
    createdAt: new Date(NOW.getTime() - 12 * 60 * 60 * 1000),
    ...overrides,
  }
}

test('an exact, nearby, recent match receives 100 points', () => {
  const result = scoreCandidate(
    { species: 'Dog', breed: 'Shiba Inu', coordinates: ORIGIN },
    candidate(),
    { now: NOW },
  )

  assert.equal(result.totalScore, 100)
  assert.deepEqual(result.breakdown, {
    species: 30,
    breed: 25,
    distance: 25,
    recency: 20,
    distanceKm: 0,
    daysAgo: 0.5,
  })
})

test('partial breed names receive proportional token-overlap points', () => {
  const similarity = breedSimilarity('Shiba', 'Shiba Inu')
  assert.ok(similarity > 0.6 && similarity < 1)

  const result = scoreCandidate(
    { species: 'Dog', breed: 'Shiba', coordinates: ORIGIN },
    candidate(),
    { now: NOW },
  )
  assert.ok(result.breakdown.breed > 15 && result.breakdown.breed < 25)
})

test('species mismatch earns no species points', () => {
  const result = scoreCandidate(
    { species: 'Cat', breed: 'Shiba Inu', coordinates: ORIGIN },
    candidate(),
    { now: NOW },
  )
  assert.equal(result.breakdown.species, 0)
})

test('distance uses the specified linear decay between one and five kilometres', () => {
  assert.equal(distanceScore(1), 25)
  assert.equal(distanceScore(3), 12.5)
  assert.equal(distanceScore(5), 0)
  assert.equal(distanceScore(5.01), 0)
})

test('recency follows the 24-hour, 7-day, and 14-day bands', () => {
  assert.equal(recencyScore(1), 20)
  assert.equal(recencyScore(1.01), 12)
  assert.equal(recencyScore(7), 12)
  assert.equal(recencyScore(8), 5)
  assert.equal(recencyScore(14), 5)
  assert.equal(recencyScore(14.01), 0)
})
