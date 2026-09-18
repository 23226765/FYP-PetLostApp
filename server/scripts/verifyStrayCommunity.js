import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import Message from '../models/Message.js'
import Notification from '../models/Notification.js'
import SavedStray from '../models/SavedStray.js'
import Stray from '../models/Stray.js'
import StrayComment from '../models/StrayComment.js'
import { connectDatabase, DATABASE_NAME, disconnectDatabase } from '../config/database.js'

const directory = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(directory, '../.env') })
const BASE_URL = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:5001/api'
const password = process.env.SEED_USER_PASSWORD
const temporaryIds = { comments: [], messages: [], strays: [] }

function seedId(type, key) {
  return createHash('sha256').update(`fyp-demo-v1:${type}:${key}`).digest('hex').slice(0, 24)
}

function assert(condition, message) { if (!condition) throw new Error(message) }
async function request(pathname, { token, method = 'GET', body, expected = 200 } = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  assert(response.status === expected, `${method} ${pathname} returned ${response.status}, expected ${expected}: ${data.error || data.message || 'unknown error'}`)
  return data
}

async function login(email) {
  const data = await request('/auth/login', { method: 'POST', body: { email, password } })
  return data
}

async function cleanup() {
  if (temporaryIds.comments.length) await StrayComment.deleteMany({ _id: { $in: temporaryIds.comments } })
  if (temporaryIds.messages.length) {
    await Notification.deleteMany({ message: { $in: temporaryIds.messages } })
    await Message.deleteMany({ _id: { $in: temporaryIds.messages } })
  }
  await SavedStray.deleteMany({ user: seedId('user', 'finder'), stray: seedId('stray', 'sha-tin-dog') })
  if (temporaryIds.strays.length) await Stray.deleteMany({ _id: { $in: temporaryIds.strays }, submissionId: 'verify-stray-community-post' })
}

async function run() {
  assert(password, 'SEED_USER_PASSWORD is required for live verification.')
  const connection = await connectDatabase()
  connected = true
  assert(connection.name === DATABASE_NAME, 'Live verification refused outside petlostapp.')
  const health = await request('/health')
  assert(health.database === DATABASE_NAME && health.db === 'connected', 'Health check is not connected to petlostapp.')
  console.log('PASS health reports connected petlostapp')

  const [owner, finder, shelter] = await Promise.all([
    login('fyp.owner@pawradar.test'), login('fyp.finder@pawradar.test'), login('fyp.shelter@pawradar.test'),
  ])
  console.log('PASS all three fyp-demo-v1 accounts authenticate')

  const guest = await request('/strays?limit=50')
  assert(guest.strays.length >= 3, 'Expected at least three stray posts.')
  assert(guest.strays.every((post) => !Object.hasOwn(post, 'reporterPhone')), 'Guest response leaked a phone number.')
  const list = await request('/strays?species=Cat&status=rescue_dispatched&district=Wan%20Chai&limit=50')
  const nearby = await request('/strays/nearby?lat=22.3193&lng=114.1694&radiusKm=50&species=Cat&status=rescue_dispatched&district=Wan%20Chai&limit=50')
  assert(JSON.stringify(list.strays.map((post) => post.id).sort()) === JSON.stringify(nearby.strays.map((post) => post.id).sort()), 'List and nearby filter results differ.')
  console.log('PASS public privacy and consistent List/Map filter data')

  const createPost = await request('/strays/report', { token: owner.token, method: 'POST', expected: 201, body: {
    species: 'Dog', description: 'Temporary live verification stray post.', photos: ['https://placehold.co/800x600/png?text=Verification+dog'], condition: 'healthy', district: 'Sha Tin', locationName: 'Temporary verification location', coordinates: [114.19, 22.38], observedAt: new Date().toISOString(), rescueStatus: 'reported', submissionId: 'verify-stray-community-post',
  } })
  temporaryIds.strays.push(createPost.stray.id)
  const retryPost = await request('/strays/report', { token: owner.token, method: 'POST', body: {
    species: 'Dog', description: 'Temporary live verification stray post.', photos: ['https://placehold.co/800x600/png?text=Verification+dog'], condition: 'healthy', district: 'Sha Tin', locationName: 'Temporary verification location', coordinates: [114.19, 22.38], observedAt: new Date().toISOString(), rescueStatus: 'reported', submissionId: 'verify-stray-community-post',
  } })
  assert(createPost.stray.id === retryPost.stray.id, 'Post retry created a duplicate.')
  await request(`/strays/${createPost.stray.id}`, { token: finder.token, method: 'PATCH', body: { description: 'Unauthorized edit' }, expected: 403 })
  await request(`/strays/${createPost.stray.id}`, { token: owner.token, method: 'PATCH', body: { description: 'Author verified edit', species: 'Dog', condition: 'healthy' } })
  await request(`/strays/${createPost.stray.id}`, { token: owner.token, method: 'DELETE' })
  await request(`/strays/${createPost.stray.id}`, { expected: 404 })
  console.log('PASS create retry idempotency, author edit/delete, and unrelated-user rejection')

  const birdId = seedId('stray', 'tai-po-bird')
  const commentBody = { text: 'Temporary verification comment.', submissionId: 'verify-stray-comment' }
  const createdComment = await request(`/strays/${birdId}/comments`, { token: finder.token, method: 'POST', body: commentBody, expected: 201 })
  temporaryIds.comments.push(createdComment.comment.id)
  const retriedComment = await request(`/strays/${birdId}/comments`, { token: finder.token, method: 'POST', body: commentBody })
  assert(createdComment.comment.id === retriedComment.comment.id, 'Comment retry created a duplicate.')
  await request(`/strays/${birdId}/comments/${createdComment.comment.id}`, { token: finder.token, method: 'PATCH', body: { text: 'Edited temporary verification comment.' } })
  await request(`/strays/${birdId}/comments/${createdComment.comment.id}`, { token: owner.token, method: 'DELETE', expected: 403 })
  const ownerNotifications = await request('/notifications', { token: owner.token })
  assert(ownerNotifications.notifications.filter((item) => item.type === 'comment' && item.strayId === birdId).length === 1, 'Expected exactly one comment notification.')
  await request(`/strays/${birdId}/comments/${createdComment.comment.id}`, { token: finder.token, method: 'DELETE' })
  temporaryIds.comments = []
  console.log('PASS idempotent comment, owner notification, edit/delete authorization')

  const dogId = seedId('stray', 'sha-tin-dog')
  await request(`/strays/${dogId}/saved`, { token: finder.token, method: 'PUT' })
  await request(`/strays/${dogId}/saved`, { token: finder.token, method: 'PUT' })
  const finderSaved = await request('/strays/saved', { token: finder.token })
  const ownerSaved = await request('/strays/saved', { token: owner.token })
  assert(finderSaved.strays.filter((post) => post.id === dogId).length === 1, 'Duplicate bookmark was returned.')
  assert(!ownerSaved.strays.some((post) => post.id === dogId), 'Private bookmark leaked to another user.')
  await request(`/strays/${dogId}/saved`, { token: finder.token, method: 'DELETE' })
  await request(`/strays/${dogId}/saved`, { token: finder.token, method: 'DELETE' })
  console.log('PASS private idempotent save and idempotent unsave')

  const taroId = seedId('pet', 'taro')
  const shareBody = { text: 'Temporary shared stray verification.', participantId: finder.user.id, sharedStrayId: birdId, clientRequestId: 'verify-stray-share' }
  const shared = await request(`/chat/${taroId}`, { token: finder.token, method: 'POST', body: shareBody, expected: 201 })
  temporaryIds.messages.push(shared.message.id)
  const sharedRetry = await request(`/chat/${taroId}`, { token: finder.token, method: 'POST', body: shareBody })
  assert(shared.message.id === sharedRetry.message.id, 'Shared message retry created a duplicate.')
  const shelterThread = await request(`/chat/${taroId}?participantId=${finder.user.id}`, { token: shelter.token })
  assert(shelterThread.messages.filter((message) => message.id === shared.message.id && message.sharedStray?.id === birdId).length === 1, 'Shelter could not open the structured shared post.')
  const unrelatedThread = await request(`/chat/${taroId}`, { token: owner.token })
  assert(!unrelatedThread.messages.some((message) => message.id === shared.message.id), 'Shared message leaked outside its conversation.')
  const shelterNotifications = await request('/notifications', { token: shelter.token })
  assert(shelterNotifications.notifications.filter((item) => item.type === 'message' && item.strayId === birdId).length === 1, 'Expected one shared-message notification.')
  console.log('PASS structured DM share, one notification, and conversation isolation')

  await cleanup()
  console.log('PASS temporary verification data cleaned with narrow identifiers')
}

let connected = false
run()
  .catch(async (error) => { console.error(`Stray community verification failed: ${error.message}`); try { if (!connected) { await connectDatabase(); connected = true }; await cleanup() } catch {} ; process.exitCode = 1 })
  .finally(async () => { if (connected) await disconnectDatabase() })
