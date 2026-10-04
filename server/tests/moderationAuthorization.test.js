import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import ContentReport from '../models/ContentReport.js'
import Message from '../models/Message.js'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import Stray from '../models/Stray.js'
import StrayComment from '../models/StrayComment.js'
import User from '../models/User.js'
import moderationRouter from '../routes/moderation.js'
import { resetRateLimitsForTests } from '../middleware/rateLimit.js'

const TEST_SECRET = 'Harbour!Moderation-Role-Matrix-2026-Strong'
const originalSecret = process.env.JWT_SECRET
const originals = {
  reportFind: ContentReport.find,
  reportCount: ContentReport.countDocuments,
  reportFindById: ContentReport.findById,
  userFindById: User.findById,
  userFind: User.find,
  petFind: Pet.find,
  petFindById: Pet.findById,
  sightingFind: Sighting.find,
  strayFind: Stray.find,
  commentFind: StrayComment.find,
  messageFind: Message.find,
}

const ids = {
  owner: new mongoose.Types.ObjectId(),
  reporter: new mongoose.Types.ObjectId(),
  unrelated: new mongoose.Types.ObjectId(),
  admin: new mongoose.Types.ObjectId(),
  pet: new mongoose.Types.ObjectId(),
  report: new mongoose.Types.ObjectId(),
}
const users = new Map([
  [String(ids.owner), { _id: ids.owner, name: 'Owner', role: 'user', email: 'owner-private@example.test', phone: '+852 5000 0001' }],
  [String(ids.reporter), { _id: ids.reporter, name: 'Reporter', role: 'user', realName: 'Private Reporter' }],
  [String(ids.unrelated), { _id: ids.unrelated, name: 'Unrelated', role: 'user' }],
  [String(ids.admin), { _id: ids.admin, name: 'Shelter Admin', role: 'shelter_admin' }],
])
const report = {
  _id: ids.report,
  reporter: ids.reporter,
  targetType: 'pet',
  targetId: ids.pet,
  targetOwner: ids.owner,
  reason: 'misinformation',
  details: 'The listing details may be inaccurate.',
  status: 'pending',
  moderatorNote: '',
  reviewedBy: null,
  reviewedAt: null,
  createdAt: new Date('2026-10-01T10:00:00Z'),
  updatedAt: new Date('2026-10-01T10:00:00Z'),
  async save() { this.updatedAt = new Date() },
  toObject() { return { ...this } },
}
const moderatedPet = {
  _id: ids.pet,
  name: 'Maple',
  species: 'Dog',
  breed: 'Golden Retriever',
  district: 'Sha Tin',
  status: 'lost',
  photo: 'https://example.test/maple.jpg',
  moderationStatus: undefined,
  moderationReason: '',
  moderatedBy: null,
  moderatedAt: null,
  async save() {},
}
let server
let baseUrl
let petAvailable = true

function chain(value) {
  return {
    select() { return this },
    sort() { return this },
    skip() { return this },
    limit() { return this },
    lean: async () => value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject) },
  }
}

function tokenFor(id) {
  return jwt.sign({ id: String(id) }, TEST_SECRET, { expiresIn: '5m' })
}

async function api(path, { token, method = 'GET', body } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function assertNoPrivateFields(value) {
  const prohibited = new Set([
    'email', 'phone', 'password', 'realName', 'location', 'coordinates',
    'locationName', 'ownerPhone', 'reporterPhone', 'alertLocation',
  ])
  function visit(item) {
    if (!item || typeof item !== 'object') return
    for (const [key, child] of Object.entries(item)) {
      assert.equal(prohibited.has(key), false, `private field leaked: ${key}`)
      visit(child)
    }
  }
  visit(value)
}

before(async () => {
  process.env.JWT_SECRET = TEST_SECRET
  resetRateLimitsForTests()
  User.findById = async (id) => users.get(String(id)) || null
  User.find = (filter) => chain((filter?._id?.$in || []).map((id) => users.get(String(id))).filter(Boolean))
  ContentReport.find = (filter) => chain(
    (!filter.status || filter.status === report.status) ? [report] : [],
  )
  ContentReport.countDocuments = async (filter) => (!filter.status || filter.status === report.status) ? 1 : 0
  ContentReport.findById = (id) => chain(String(id) === String(ids.report) ? report : null)
  Pet.find = () => chain(petAvailable ? [moderatedPet] : [])
  Pet.findById = (id) => chain(String(id) === String(ids.pet) ? moderatedPet : null)
  Sighting.find = () => chain([])
  Stray.find = () => chain([])
  StrayComment.find = () => chain([])
  Message.find = () => chain([])

  const app = express()
  app.use(express.json())
  app.use('/api/moderation', moderationRouter)
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  ContentReport.find = originals.reportFind
  ContentReport.countDocuments = originals.reportCount
  ContentReport.findById = originals.reportFindById
  User.findById = originals.userFindById
  User.find = originals.userFind
  Pet.find = originals.petFind
  Pet.findById = originals.petFindById
  Sighting.find = originals.sightingFind
  Stray.find = originals.strayFind
  StrayComment.find = originals.commentFind
  Message.find = originals.messageFind
  if (originalSecret === undefined) delete process.env.JWT_SECRET
  else process.env.JWT_SECRET = originalSecret
  if (server) await new Promise((resolve) => server.close(resolve))
})

test('moderation role matrix denies guests and every ordinary authenticated role', async () => {
  assert.equal((await api('/api/moderation/reports')).status, 401)
  for (const roleId of [ids.owner, ids.reporter, ids.unrelated]) {
    const response = await api('/api/moderation/reports', { token: tokenFor(roleId) })
    assert.equal(response.status, 403)
    assert.equal((await response.json()).code, 'SHELTER_ADMIN_REQUIRED')
  }
})

test('shelter administrator receives a safe, paginated moderation projection', async () => {
  const response = await api('/api/moderation/reports?status=pending', { token: tokenFor(ids.admin) })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.reports.length, 1)
  assert.deepEqual(body.pagination, { page: 1, limit: 20, total: 1 })
  assert.equal(body.reports[0].target.title, 'Maple')
  assert.equal(body.reports[0].reporter.name, 'Reporter')
  assert.equal(body.reports[0].targetOwner.name, 'Owner')
  assertNoPrivateFields(body)
})

test('deleted target content stays in the audit queue as unavailable without leaking stale data', async () => {
  petAvailable = false
  try {
    const response = await api('/api/moderation/reports?status=pending', { token: tokenFor(ids.admin) })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.reports[0].target.available, false)
    assert.equal(body.reports[0].target.title, '')
    assertNoPrivateFields(body)
  } finally {
    petAvailable = true
  }
})

test('only shelter administrators can save an audited, non-destructive decision', async () => {
  const ordinary = await api(`/api/moderation/reports/${ids.report}`, {
    token: tokenFor(ids.owner), method: 'PATCH', body: { status: 'reviewed', note: 'Checked.' },
  })
  assert.equal(ordinary.status, 403)

  const response = await api(`/api/moderation/reports/${ids.report}`, {
    token: tokenFor(ids.admin), method: 'PATCH', body: { status: 'reviewed', note: '  Evidence checked.  ' },
  })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.report.status, 'reviewed')
  assert.equal(body.report.review.note, 'Evidence checked.')
  assert.equal(body.report.review.reviewedBy.id, String(ids.admin))
  assert.ok(body.report.review.reviewedAt)
  assertNoPrivateFields(body)
  assert.equal(report.targetId, ids.pet, 'target content remains unchanged')
  assert.notEqual(moderatedPet.moderationStatus, 'hidden', 'report decisions do not hide content')
})

test('moderation updates reject unknown fields and invalid statuses', async () => {
  const token = tokenFor(ids.admin)
  const unknown = await api(`/api/moderation/reports/${ids.report}`, {
    token, method: 'PATCH', body: { status: 'reviewed', deleteContent: true },
  })
  assert.equal(unknown.status, 400)
  assert.equal((await unknown.json()).code, 'INVALID_MODERATION_BODY')

  const invalid = await api(`/api/moderation/reports/${ids.report}`, {
    token, method: 'PATCH', body: { status: 'banned' },
  })
  assert.equal(invalid.status, 400)
  assert.equal((await invalid.json()).code, 'INVALID_REPORT_STATUS')
})

test('only shelter administrators can hide and restore supported content with an audit reason', async () => {
  const path = `/api/moderation/content/pet/${ids.pet}/visibility`
  const ordinary = await api(path, {
    token: tokenFor(ids.owner),
    method: 'PATCH',
    body: { moderationStatus: 'hidden', reason: 'Unsafe listing' },
  })
  assert.equal(ordinary.status, 403)

  const missingReason = await api(path, {
    token: tokenFor(ids.admin),
    method: 'PATCH',
    body: { moderationStatus: 'hidden' },
  })
  assert.equal(missingReason.status, 400)
  assert.equal((await missingReason.json()).code, 'MODERATION_REASON_REQUIRED')

  const hidden = await api(path, {
    token: tokenFor(ids.admin),
    method: 'PATCH',
    body: { moderationStatus: 'hidden', reason: '  Contains unsafe contact instructions.  ' },
  })
  assert.equal(hidden.status, 200)
  const hiddenBody = await hidden.json()
  assert.equal(hiddenBody.content.moderation.status, 'hidden')
  assert.equal(hiddenBody.content.moderation.reason, 'Contains unsafe contact instructions.')
  assert.equal(hiddenBody.content.moderation.moderatedBy.id, String(ids.admin))
  assert.ok(hiddenBody.content.moderation.moderatedAt)
  assert.equal(moderatedPet.moderationStatus, 'hidden')
  assert.equal(String(moderatedPet.moderatedBy), String(ids.admin))

  const hiddenAgain = await api(path, {
    token: tokenFor(ids.admin),
    method: 'PATCH',
    body: { moderationStatus: 'hidden', reason: 'Contains unsafe contact instructions.' },
  })
  assert.equal(hiddenAgain.status, 200)
  assert.equal((await hiddenAgain.json()).content.id, String(ids.pet))
  assert.equal(moderatedPet.moderationStatus, 'hidden')

  const queue = await api('/api/moderation/reports?status=all', { token: tokenFor(ids.admin) })
  const queueBody = await queue.json()
  assert.equal(queueBody.reports[0].target.available, true)
  assert.equal(queueBody.reports[0].target.moderation.status, 'hidden')
  assert.equal(queueBody.reports[0].target.moderation.reason, 'Contains unsafe contact instructions.')

  const restored = await api(path, {
    token: tokenFor(ids.admin),
    method: 'PATCH',
    body: { moderationStatus: 'visible', reason: 'Appeal reviewed and approved.' },
  })
  assert.equal(restored.status, 200)
  assert.equal((await restored.json()).content.moderation.status, 'visible')
  assert.equal(moderatedPet.moderationStatus, 'visible')
  assert.equal(moderatedPet.moderationReason, 'Appeal reviewed and approved.')
})
