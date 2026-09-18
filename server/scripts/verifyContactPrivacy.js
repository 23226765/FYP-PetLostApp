import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { connectDatabase, DATABASE_NAME, disconnectDatabase } from '../config/database.js'
import Message from '../models/Message.js'
import User from '../models/User.js'

const SEED_BATCH = 'fyp-demo-v1'
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(scriptDirectory, '../.env') })

const apiBase = (process.env.PAWRADAR_API_URL || 'http://127.0.0.1:5000/api').replace(/\/$/, '')
const password = process.env.SEED_USER_PASSWORD
const demoAccounts = Object.freeze({
  owner: 'fyp.owner@pawradar.test',
  finder: 'fyp.finder@pawradar.test',
  shelter: 'fyp.shelter@pawradar.test',
})
const finalVisibility = Object.freeze({
  owner: 'authenticated',
  finder: 'private',
  shelter: 'private',
})

let temporaryMessageId = null
let seededUsers = null
let currentScenario = 'startup'

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
  assert.equal(response.user.email, email)
  assert.ok(response.token)
  return response
}

async function setVisibility(token, contactVisibility) {
  const response = await api('/auth/me/privacy', {
    token,
    method: 'PATCH',
    body: JSON.stringify({ contactVisibility }),
  })
  assert.equal(response.privacy.contactVisibility, contactVisibility)
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function assertContactHidden(record, field, forbiddenValue) {
  assert.equal(record.canViewContact, false)
  assert.equal(hasOwn(record, field), false)
  assert.equal(JSON.stringify(record).includes(forbiddenValue), false)
}

function assertContactVisible(record, field, expectedValue) {
  assert.equal(record.canViewContact, true)
  assert.equal(record[field], expectedValue)
}

function findPet(payload, name) {
  const collection = payload.pets || payload.matches || []
  const pet = collection.find((candidate) => candidate.name === name)
  assert.ok(
    pet,
    `${name} was not returned by the endpoint (received: ${collection
      .map((candidate) => candidate.name)
      .join(', ') || 'none'})`,
  )
  return pet
}

async function loadSeededUsers() {
  const documents = await User.find({
    email: { $in: Object.values(demoAccounts) },
    seedBatch: SEED_BATCH,
  }).select('+seedBatch phone email privacy.contactVisibility')
  assert.equal(documents.length, 3, 'Expected all three fyp-demo-v1 users')
  return Object.fromEntries(
    Object.entries(demoAccounts).map(([role, email]) => {
      const user = documents.find((candidate) => candidate.email === email)
      assert.ok(user, `Missing seeded ${role} account`)
      return [role, user]
    }),
  )
}

async function restoreExpectedPrivacy() {
  if (!seededUsers) return
  await Promise.all(
    Object.entries(finalVisibility).map(([role, contactVisibility]) =>
      User.updateOne(
        { _id: seededUsers[role]._id, seedBatch: SEED_BATCH },
        { $set: { 'privacy.contactVisibility': contactVisibility } },
      ),
    ),
  )
}

async function cleanup() {
  if (temporaryMessageId) {
    await Message.deleteOne({ _id: temporaryMessageId, text: 'Privacy verification message' })
  }
  await restoreExpectedPrivacy()
  await disconnectDatabase()
}

async function run() {
  if (typeof password !== 'string' || password.length < 6) {
    throw new Error('SEED_USER_PASSWORD is required in server/.env.')
  }

  const connection = await connectDatabase()
  assert.equal(connection.name, DATABASE_NAME)
  seededUsers = await loadSeededUsers()

  const health = await api('/health')
  assert.equal(health.database, DATABASE_NAME)
  const owner = await login(demoAccounts.owner)
  const finder = await login(demoAccounts.finder)
  const shelter = await login(demoAccounts.shelter)

  await setVisibility(owner.token, 'authenticated')
  await setVisibility(finder.token, 'private')
  await setVisibility(shelter.token, 'private')

  const ownerPrivacy = await api('/auth/me/privacy', { token: owner.token })
  assert.equal(ownerPrivacy.privacy.contactVisibility, 'authenticated')
  await api('/auth/me/privacy', {
    token: owner.token,
    method: 'PATCH',
    expectedStatus: 400,
    body: JSON.stringify({ contactVisibility: 'public' }),
  })
  await api('/auth/me/privacy', {
    token: owner.token,
    method: 'PATCH',
    expectedStatus: 400,
    body: JSON.stringify({ contactVisibility: 'authenticated', phone: '+852 0000 0000' }),
  })

  currentScenario = 'owner self-contact'
  const ownerMine = await api('/pets/mine', { token: owner.token })
  const maple = findPet(ownerMine, 'Maple')
  assertContactVisible(maple, 'ownerPhone', seededUsers.owner.phone)
  assert.ok(Array.isArray(maple.coordinates) && maple.coordinates.length === 2)
  const [mapleLng, mapleLat] = maple.coordinates

  currentScenario = 'anonymous pet list'
  const anonymousList = await api('/pets?limit=50')
  assertContactHidden(findPet(anonymousList, 'Maple'), 'ownerPhone', seededUsers.owner.phone)

  currentScenario = 'authenticated pet list'
  const finderList = await api('/pets?limit=50', { token: finder.token })
  assertContactVisible(findPet(finderList, 'Maple'), 'ownerPhone', seededUsers.owner.phone)

  currentScenario = 'authenticated nearby Radar'
  const finderNearby = await api(
    `/pets/nearby?lat=${mapleLat}&lng=${mapleLng}&radiusKm=10`,
    { token: finder.token },
  )
  assertContactVisible(findPet(finderNearby, 'Maple'), 'ownerPhone', seededUsers.owner.phone)

  currentScenario = 'pet detail'
  const anonymousDetail = await api(`/pets/${maple.id}`)
  assertContactHidden(anonymousDetail.pet, 'ownerPhone', seededUsers.owner.phone)
  const finderDetail = await api(`/pets/${maple.id}`, { token: finder.token })
  assertContactVisible(finderDetail.pet, 'ownerPhone', seededUsers.owner.phone)

  currentScenario = 'Smart Match'
  const finderMatches = await api('/matches/candidates', {
    token: finder.token,
    method: 'POST',
    body: JSON.stringify({
      species: 'Dog',
      breed: 'Shiba Inu',
      coordinates: maple.coordinates,
      limit: 20,
    }),
  })
  assertContactVisible(findPet(finderMatches, 'Maple'), 'ownerPhone', seededUsers.owner.phone)

  currentScenario = 'sighting history'
  const ownerSightings = await api(`/pets/${maple.id}/sightings`, { token: owner.token })
  const finderSighting = ownerSightings.sightings.find(
    (sighting) => sighting.reportedBy === String(seededUsers.finder._id),
  )
  assert.ok(finderSighting, 'Expected a finder sighting for Maple')
  assertContactHidden(finderSighting, 'reporterPhone', seededUsers.finder.phone)

  currentScenario = 'stray reports'
  const anonymousStrays = await api('/strays')
  const finderStray = anonymousStrays.strays.find(
    (stray) => stray.reportedBy === String(seededUsers.finder._id),
  )
  assert.ok(finderStray, 'Expected a finder-owned stray report')
  assertContactHidden(finderStray, 'reporterPhone', seededUsers.finder.phone)
  const finderStrays = await api('/strays/mine', { token: finder.token })
  const ownStray = finderStrays.strays.find(
    (stray) => stray.reportedBy === String(seededUsers.finder._id),
  )
  assertContactVisible(ownStray, 'reporterPhone', seededUsers.finder.phone)

  currentScenario = 'notifications'
  const notifications = await api('/notifications', { token: owner.token })
  assert.equal(JSON.stringify(notifications).includes(seededUsers.owner.phone), false)
  assert.equal(JSON.stringify(notifications).includes(seededUsers.finder.phone), false)

  currentScenario = 'visible chat summary'
  const visibleInbox = await api('/chat/inbox', { token: finder.token })
  const visibleMapleConversation = visibleInbox.conversations.find(
    (conversation) => conversation.pet.name === 'Maple',
  )
  assert.ok(visibleMapleConversation, 'Expected the seeded Maple conversation')
  assertContactVisible(
    visibleMapleConversation.pet,
    'ownerPhone',
    seededUsers.owner.phone,
  )

  currentScenario = 'immediate privacy toggle'
  await setVisibility(owner.token, 'private')

  currentScenario = 'private pet list'
  const privateList = await api('/pets?limit=50', { token: finder.token })
  assertContactHidden(findPet(privateList, 'Maple'), 'ownerPhone', seededUsers.owner.phone)
  const privateNearby = await api(
    `/pets/nearby?lat=${mapleLat}&lng=${mapleLng}&radiusKm=10`,
    { token: finder.token },
  )
  assertContactHidden(findPet(privateNearby, 'Maple'), 'ownerPhone', seededUsers.owner.phone)
  const privateDetail = await api(`/pets/${maple.id}`, { token: finder.token })
  assertContactHidden(privateDetail.pet, 'ownerPhone', seededUsers.owner.phone)
  const privateInbox = await api('/chat/inbox', { token: finder.token })
  const privateMapleConversation = privateInbox.conversations.find(
    (conversation) => conversation.pet.name === 'Maple',
  )
  assertContactHidden(privateMapleConversation.pet, 'ownerPhone', seededUsers.owner.phone)

  const selfDetail = await api(`/pets/${maple.id}`, { token: owner.token })
  assertContactVisible(selfDetail.pet, 'ownerPhone', seededUsers.owner.phone)

  currentScenario = 'private in-app messaging'
  const createdMessage = await api(`/chat/${maple.id}`, {
    token: finder.token,
    method: 'POST',
    expectedStatus: 201,
    body: JSON.stringify({ text: 'Privacy verification message' }),
  })
  temporaryMessageId = createdMessage.message.id
  assert.equal(createdMessage.message.text, 'Privacy verification message')

  await api(`/chat/${maple.id}`, {
    token: owner.token,
    method: 'POST',
    expectedStatus: 400,
    body: JSON.stringify({
      participantId: String(seededUsers.owner._id),
      text: 'This self conversation must be rejected',
    }),
  })

  console.log(`PASS database target: ${DATABASE_NAME}`)
  console.log('PASS privacy defaults and update validation')
  console.log('PASS anonymous, authenticated, private, and self contact rules')
  console.log('PASS list, nearby, detail, Smart Match, sighting, stray, notification, and inbox surfaces')
  console.log('PASS in-app messaging while private and self-conversation rejection')
  console.log('PASS temporary verification data cleanup and demo preference restoration')
}

run()
  .catch((error) => {
    console.error(`Contact privacy verification failed during ${currentScenario}: ${error.message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await cleanup().catch((error) => {
      console.error(`Contact privacy cleanup failed: ${error.message}`)
      process.exitCode = 1
    })
  })
