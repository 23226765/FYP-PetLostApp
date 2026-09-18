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

const API_ROOT = process.env.API_BASE_URL || 'http://localhost:5000/api'
const TEST_PASSWORD = process.env.SEED_USER_PASSWORD
const EXPECTED_SEED_BATCH = 'fyp-demo-v1'
const emails = {
  owner: 'fyp.owner@pawradar.test',
  finder: 'fyp.finder@pawradar.test',
  shelter: 'fyp.shelter@pawradar.test',
}

function invariant(value, message) {
  if (!value) throw new Error(message)
}

async function request(pathname, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${API_ROOT}${pathname}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`${method} ${pathname} failed with HTTP ${response.status}: ${payload.error || payload.message || 'Unknown error'}`)
  }
  return { status: response.status, payload }
}

async function login(email) {
  const { payload } = await request('/auth/login', {
    method: 'POST',
    body: { email, password: TEST_PASSWORD },
  })
  invariant(payload.token, `Login did not return a token for ${email}.`)
  return payload.token
}

function ids(items) {
  return new Set(items.map((item) => String(item.id)))
}

async function run() {
  invariant(TEST_PASSWORD, 'SEED_USER_PASSWORD is required in server/.env.')
  const connection = await connectDatabase()
  invariant(connection.name === DATABASE_NAME, `Refusing verification outside ${DATABASE_NAME}.`)

  const seededUsers = await connection.collection('users').countDocuments({ seedBatch: EXPECTED_SEED_BATCH })
  invariant(seededUsers >= 3, 'The fyp-demo-v1 accounts are not available in petlostapp.')

  let createdSightingId = null
  let mapleId = null
  let originalMapleStatus = null
  const submissionId = `regression_${randomUUID()}`

  try {
    const [ownerToken, finderToken, shelterToken] = await Promise.all([
      login(emails.owner),
      login(emails.finder),
      login(emails.shelter),
    ])

    const [{ payload: ownerMine }, { payload: finderMine }] = await Promise.all([
      request('/pets/mine', { token: ownerToken }),
      request('/pets/mine', { token: finderToken }),
    ])
    const ownerPets = ownerMine.pets
    const finderPets = finderMine.pets
    invariant(['Maple', 'Pixel', 'Comet'].every((name) => ownerPets.some((pet) => pet.name === name)), 'Owner seeded pets are incomplete.')
    invariant(finderPets.some((pet) => pet.name === 'Nimbus'), 'Finder-owned Nimbus is missing.')

    const maple = ownerPets.find((pet) => pet.name === 'Maple')
    invariant(maple?.id, 'Maple could not be resolved by unique id.')
    mapleId = maple.id
    originalMapleStatus = maple.status
    const ownerPetIds = ids(ownerPets)
    const finderPetIds = ids(finderPets)

    const [{ payload: ownerRadar }, { payload: finderRadar }] = await Promise.all([
      request('/pets', { token: ownerToken }),
      request('/pets', { token: finderToken }),
    ])
    invariant(ownerRadar.pets.every((pet) => !ownerPetIds.has(String(pet.id))), 'Owner radar returned an owner-created pet.')
    invariant(ownerRadar.pets.some((pet) => !ownerPetIds.has(String(pet.id))), 'Owner radar did not retain another user’s eligible pet.')
    invariant(finderRadar.pets.every((pet) => !finderPetIds.has(String(pet.id))), 'Finder radar returned Nimbus.')
    invariant(['Maple', 'Pixel', 'Comet'].some((name) => finderRadar.pets.some((pet) => pet.name === name)), 'Finder radar did not retain owner-created pets.')
    invariant(ownerRadar.pagination.total === ownerRadar.pets.length, 'Owner list count and first page are inconsistent for seeded data.')

    const encodedStatus = encodeURIComponent(maple.status)
    const { payload: statusRadar } = await request(`/pets?status=${encodedStatus}`, { token: ownerToken })
    invariant(statusRadar.pets.every((pet) => pet.status === maple.status), 'Status-filtered radar returned a mismatched status.')
    invariant(statusRadar.pets.every((pet) => !ownerPetIds.has(String(pet.id))), 'Status-filtered radar returned an owner-created pet.')
    invariant(statusRadar.pagination.total === statusRadar.pets.length, 'Status-filtered count and list are inconsistent for seeded data.')

    const [longitude, latitude] = maple.coordinates
    const { payload: nearbyRadar } = await request(
      `/pets/nearby?lng=${longitude}&lat=${latitude}&radiusKm=50&status=${encodedStatus}`,
      { token: ownerToken },
    )
    invariant(nearbyRadar.pets.every((pet) => pet.status === maple.status), 'Nearby status filter returned a mismatched status.')
    invariant(nearbyRadar.pets.every((pet) => !ownerPetIds.has(String(pet.id))), 'Nearby radar returned an owner-created pet.')
    invariant(nearbyRadar.pagination.total === nearbyRadar.pets.length, 'Nearby count, map, and list payload are inconsistent for seeded data.')

    const sightingPayload = {
      coordinates: [Number(longitude) + 0.0001, Number(latitude) + 0.0001],
      locationName: 'FYP regression verification point',
      note: 'Temporary fyp-demo-v1 regression sighting; safe to remove by exact id.',
      submissionId,
    }
    const first = await request(`/pets/${mapleId}/sighting`, {
      token: finderToken,
      method: 'POST',
      body: sightingPayload,
    })
    invariant(first.status === 201, 'The first sighting submission was not created.')
    createdSightingId = first.payload.sighting?.id
    invariant(createdSightingId, 'The sighting response did not include its MongoDB id.')

    const retry = await request(`/pets/${mapleId}/sighting`, {
      token: finderToken,
      method: 'POST',
      body: sightingPayload,
    })
    invariant(retry.status === 200 && retry.payload.duplicate === true, 'Retry was not handled idempotently.')
    invariant(retry.payload.sighting.id === createdSightingId, 'Retry created or returned a different sighting.')

    const [{ payload: ownerHistory }, { payload: reporterHistory }, { payload: unrelatedHistory }] = await Promise.all([
      request(`/pets/${mapleId}/sightings`, { token: ownerToken }),
      request(`/pets/${mapleId}/sightings`, { token: finderToken }),
      request(`/pets/${mapleId}/sightings`, { token: shelterToken }),
    ])
    const ownerMatches = ownerHistory.sightings.filter((item) => item.id === createdSightingId)
    const reporterMatch = reporterHistory.sightings.find((item) => item.id === createdSightingId)
    const unrelatedMatch = unrelatedHistory.sightings.find((item) => item.id === createdSightingId)
    invariant(ownerMatches.length === 1, 'Owner history did not contain exactly one submitted sighting.')
    invariant(ownerMatches[0].reportedBy && ownerMatches[0].reporterName, 'Owner could not view permitted reporter identity.')
    invariant(reporterMatch?.reportedBy && reporterMatch?.reporterName, 'Reporter could not view their own identity fields.')
    invariant(unrelatedMatch && !unrelatedMatch.reportedBy && !unrelatedMatch.reporterName && !unrelatedMatch.reporterPhone, 'Unrelated user received private reporter fields.')

    const refreshed = await request(`/pets/${mapleId}/sightings`, { token: ownerToken })
    invariant(refreshed.payload.sightings.filter((item) => item.id === createdSightingId).length === 1, 'Refreshing duplicated the sighting history entry.')

    const { payload: ownerNotifications } = await request('/notifications', { token: ownerToken })
    invariant(
      ownerNotifications.notifications.some(
        (notification) => notification.petId === mapleId && notification.sightingId === createdSightingId,
      ),
      'Owner notification did not link to the correct pet and sighting ids.',
    )

    const storedCount = await Sighting.countDocuments({ _id: createdSightingId, pet: mapleId })
    invariant(storedCount === 1, 'MongoDB did not contain exactly one test sighting document.')

    console.log('Live regression verification passed in database "petlostapp".')
    console.log('Verified profile ownership, list/status/nearby exclusion, idempotent sighting creation, owner access, privacy, notification links, and refresh stability.')
  } finally {
    try {
      let remainingTemporarySightings = 0
      if (createdSightingId) {
        await Notification.deleteMany({ sighting: createdSightingId })
        await Sighting.deleteOne({ _id: createdSightingId, submissionId })
        remainingTemporarySightings = await Sighting.countDocuments({ _id: createdSightingId })
      }
      if (mapleId && originalMapleStatus) {
        await Pet.updateOne(
          { _id: mapleId, seedBatch: EXPECTED_SEED_BATCH },
          { $set: { status: originalMapleStatus } },
        )
      }
      if (createdSightingId) {
        invariant(
          remainingTemporarySightings === 0,
          'Temporary regression sighting cleanup did not complete.',
        )
        console.log('Removed the exact temporary sighting and its linked test notifications; pre-existing records were untouched.')
      }
    } finally {
      await disconnectDatabase()
    }
  }
}

run().catch((error) => {
  console.error(`Live regression verification failed: ${error.message}`)
  process.exitCode = 1
})
