import test from 'node:test'
import assert from 'node:assert/strict'
import {
  recencyFactor,
  sightingIntensity,
  strayIntensity,
} from '../services/hotspotAnalytics.js'
import { listHotspots } from '../controllers/analyticsController.js'

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
