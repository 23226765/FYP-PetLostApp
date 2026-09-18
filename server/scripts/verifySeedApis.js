import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const SEED_BATCH = 'fyp-demo-v1'
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(scriptDirectory, '../.env') })

const apiBase = (process.env.PAWRADAR_API_URL || 'http://127.0.0.1:5000/api').replace(/\/$/, '')
const password = process.env.SEED_USER_PASSWORD

function seedId(type, key) {
  return createHash('sha256')
    .update(`${SEED_BATCH}:${type}:${key}`)
    .digest('hex')
    .slice(0, 24)
}

async function api(pathname, { token, ...options } = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${apiBase}${pathname}`, { ...options, headers })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${pathname} returned ${response.status}`)
  return body
}

async function login(email) {
  const response = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  assert.equal(typeof response.token, 'string')
  assert.ok(response.token.length > 20)
  assert.equal(response.user.email, email)
  return response
}

async function run() {
  if (process.env.ALLOW_TEST_SEED !== 'true') {
    throw new Error('API verification requires ALLOW_TEST_SEED=true in server/.env.')
  }
  if (typeof password !== 'string' || password.length < 6) {
    throw new Error('API verification requires SEED_USER_PASSWORD in server/.env.')
  }

  const health = await api('/health')
  assert.equal(health.database, 'petlostapp')
  assert.equal(health.expectedDatabase, 'petlostapp')

  const owner = await login('fyp.owner@pawradar.test')
  const finder = await login('fyp.finder@pawradar.test')
  await login('fyp.shelter@pawradar.test')

  const allPets = await api('/pets')
  for (const name of ['Maple', 'Pixel', 'Comet', 'Taro', 'Nimbus']) {
    assert.ok(allPets.pets.some((pet) => pet.name === name), `Missing seeded pet: ${name}`)
  }

  const lostPets = await api('/pets?status=lost')
  assert.ok(lostPets.pets.some((pet) => pet.name === 'Maple'))
  assert.ok(lostPets.pets.some((pet) => pet.name === 'Taro'))
  assert.ok(lostPets.pets.every((pet) => pet.status === 'lost'))

  const nearby = await api('/pets/nearby?lat=22.2819&lng=114.1588&radiusKm=5&status=lost')
  assert.ok(nearby.pets.some((pet) => pet.name === 'Maple'))
  assert.ok(nearby.pets.every((pet) => typeof pet.distanceKm === 'number'))

  const mapleId = seedId('pet', 'maple')
  const finderId = seedId('user', 'finder')
  const sightings = await api(`/pets/${mapleId}/sightings`)
  assert.ok(sightings.sightings.length >= 2)

  const ownerInbox = await api('/chat/inbox', { token: owner.token })
  const finderInbox = await api('/chat/inbox', { token: finder.token })
  assert.ok(ownerInbox.conversations.some((item) => item.pet.name === 'Maple'))
  assert.ok(finderInbox.conversations.some((item) => item.pet.name === 'Maple'))

  const ownerThread = await api(`/chat/${mapleId}?participantId=${finderId}`, {
    token: owner.token,
  })
  const finderThread = await api(`/chat/${mapleId}`, { token: finder.token })
  assert.equal(ownerThread.viewerRole, 'owner')
  assert.equal(finderThread.viewerRole, 'finder')
  assert.equal(ownerThread.messages.length, 4)
  assert.equal(finderThread.messages.length, 4)

  const notifications = await api('/notifications', { token: owner.token })
  assert.ok(notifications.notifications.length >= 2)

  const strays = await api('/strays?status=rescue_dispatched')
  assert.ok(strays.strays.some((stray) => stray.location.includes('Southorn Playground')))

  console.log('PASS database target: petlostapp')
  console.log('PASS login: owner, finder, shelter')
  console.log('PASS pets: list and lost-status filter')
  console.log('PASS nearby: GeoJSON radius search')
  console.log('PASS sightings: linked trajectory records')
  console.log('PASS chat: inbox and four-message thread')
  console.log('PASS notifications: authenticated owner feed')
  console.log('PASS strays: rescue-status filter')
}

run().catch((error) => {
  console.error(`Seed API verification failed: ${error.message}`)
  process.exitCode = 1
})
