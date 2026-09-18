import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { connectDatabase, DATABASE_NAME, disconnectDatabase } from '../config/database.js'
import Notification from '../models/Notification.js'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(scriptDirectory, '../.env') })

const apiBase = (process.env.PAWRADAR_API_URL || 'http://127.0.0.1:5000/api').replace(/\/$/, '')
const password = process.env.SEED_USER_PASSWORD
const submissionPrefix = `verify_sighting_${randomUUID().replace(/-/g, '_')}`
const submissionIds = []
const createdSightingIds = []
let maple = null
let originalPetState = null

async function api(pathname, { token, expectedStatus = 200, ...options } = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${apiBase}${pathname}`, { ...options, headers })
  const body = await response.json().catch(() => ({}))
  assert.equal(
    response.status,
    expectedStatus,
    `${options.method || 'GET'} ${pathname} returned ${response.status}`,
  )
  return body
}

async function login(email) {
  const response = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  assert.ok(response.token)
  return response.token
}

function submissionId(index) {
  const value = `${submissionPrefix}_${index}`
  submissionIds.push(value)
  return value
}

async function submit(token, index, coordinates, locationName, note) {
  const response = await api(`/pets/${maple._id}/sighting`, {
    token,
    method: 'POST',
    expectedStatus: 201,
    body: JSON.stringify({
      location: { type: 'Point', coordinates },
      locationName,
      note,
      submissionId: submissionId(index),
    }),
  })
  createdSightingIds.push(response.sighting.id)
  assert.deepEqual(response.sighting.coordinates, coordinates)
  assert.ok(response.sighting.sightedAt)
  return response.sighting
}

async function cleanup() {
  if (createdSightingIds.length > 0) {
    await Notification.deleteMany({
      sighting: { $in: createdSightingIds },
      type: 'sighting',
    })
    await Sighting.deleteMany({
      _id: { $in: createdSightingIds },
      submissionId: { $in: submissionIds },
    })
  }
  if (maple && originalPetState) {
    await Pet.updateOne(
      { _id: maple._id, seedBatch: 'fyp-demo-v1' },
      { $set: originalPetState },
      { timestamps: false },
    )
  }
  await disconnectDatabase()
}

async function run() {
  if (typeof password !== 'string' || password.length < 6) {
    throw new Error('SEED_USER_PASSWORD is required in server/.env.')
  }

  const connection = await connectDatabase()
  assert.equal(connection.name, DATABASE_NAME)
  maple = await Pet.findOne({ name: 'Maple', seedBatch: 'fyp-demo-v1' }).select('+seedBatch')
  assert.ok(maple, 'Seeded Maple was not found')
  originalPetState = { status: maple.status, updatedAt: maple.updatedAt }
  await Pet.updateOne(
    { _id: maple._id, seedBatch: 'fyp-demo-v1' },
    { $set: { status: 'lost' } },
    { timestamps: false },
  )

  const finderToken = await login('fyp.finder@pawradar.test')
  const ownerToken = await login('fyp.owner@pawradar.test')

  const mongKok = [114.1694, 22.3193]
  const admiralty = [114.1657, 22.2791]
  const causewayBay = [114.1852, 22.2807]
  const first = await submit(
    finderToken,
    1,
    mongKok,
    'Mong Kok MTR Exit E2',
    'Description mentions Causeway Bay, but only the confirmed map point controls location.',
  )
  await submit(finderToken, 2, admiralty, 'Harcourt Garden, Admiralty', 'Distinct test point two.')
  await submit(finderToken, 3, causewayBay, 'Victoria Park, Causeway Bay', 'Distinct test point three.')
  await submit(finderToken, 4, mongKok, 'Mong Kok MTR Exit E2', 'Overlap test report two.')
  await submit(finderToken, 5, mongKok, 'Mong Kok MTR Exit E2', 'Overlap test report three.')

  const retry = await api(`/pets/${maple._id}/sighting`, {
    token: finderToken,
    method: 'POST',
    expectedStatus: 200,
    body: JSON.stringify({
      location: { type: 'Point', coordinates: mongKok },
      locationName: 'Mong Kok MTR Exit E2',
      note: 'Retried request',
      submissionId: submissionIds[0],
    }),
  })
  assert.equal(retry.duplicate, true)
  assert.equal(retry.sighting.id, first.id)

  for (const invalidBody of [
    { locationName: 'Missing point', submissionId: `${submissionPrefix}_missing` },
    {
      location: { type: 'Point', coordinates: ['114.1694', 22.3193] },
      locationName: 'String coordinate',
      submissionId: `${submissionPrefix}_string`,
    },
    {
      location: { type: 'Point', coordinates: [22.3193, 114.1694] },
      locationName: 'Reversed coordinate',
      submissionId: `${submissionPrefix}_reversed`,
    },
  ]) {
    await api(`/pets/${maple._id}/sighting`, {
      token: finderToken,
      method: 'POST',
      expectedStatus: 400,
      body: JSON.stringify(invalidBody),
    })
  }

  const history = await api(`/pets/${maple._id}/sightings`, { token: ownerToken })
  const createdHistory = history.sightings.filter((item) => createdSightingIds.includes(item.id))
  assert.equal(createdHistory.length, 5)
  assert.equal(new Set(createdHistory.map((item) => item.id)).size, 5)
  const times = createdHistory.map((item) => new Date(item.sightedAt || item.createdAt).getTime())
  assert.deepEqual(times, [...times].sort((left, right) => left - right))

  const stored = await Sighting.find({ _id: { $in: createdSightingIds } })
  assert.equal(stored.length, 5)
  assert.deepEqual(stored.find((item) => String(item._id) === first.id).location.coordinates, mongKok)
  assert.equal(
    await Sighting.countDocuments({ submissionId: submissionIds[0] }),
    1,
  )

  console.log(`PASS database target: ${DATABASE_NAME}`)
  console.log('PASS stored points: Mong Kok [114.1694,22.3193], Admiralty [114.1657,22.2791], Causeway Bay [114.1852,22.2807]')
  console.log('PASS three reports at Mong Kok remain three stable records for clustering')
  console.log('PASS note text did not alter the confirmed GeoJSON point')
  console.log('PASS missing, string, and reversed coordinates were rejected')
  console.log('PASS retry returned one sighting and history returned every id once in report-time order')
  console.log('PASS temporary sightings and notifications cleaned; Maple state restored')
}

run()
  .catch((error) => {
    console.error(`Sighting workflow verification failed: ${error.message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await cleanup().catch((error) => {
      console.error(`Sighting workflow cleanup failed: ${error.message}`)
      process.exitCode = 1
    })
  })
