import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import Message from '../models/Message.js'
import Notification from '../models/Notification.js'
import Pet from '../models/Pet.js'
import User from '../models/User.js'
import UserBlock from '../models/UserBlock.js'
import Stray from '../models/Stray.js'
import StrayComment from '../models/StrayComment.js'
import Sighting from '../models/Sighting.js'
import { createMessage, getMessages, listConversations, markMessagesRead } from '../controllers/chatController.js'
import { listNotifications, markRead, markAllRead } from '../controllers/notificationController.js'
import chatRouter from '../routes/chat.js'

const id = () => new mongoose.Types.ObjectId()
const same = (a, b) => String(a ?? '') === String(b ?? '')
function matches(doc, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some((item) => matches(doc, item))
    if (key === '$and') return value.every((item) => matches(doc, item))
    if (value && Object.getPrototypeOf(value) === Object.prototype) {
      if ('$in' in value) return value.$in.some((item) => same(doc[key], item))
      if ('$ne' in value) return !same(doc[key], value.$ne)
    }
    return same(doc[key], value)
  })
}
function query(values) {
  let result = values
  return {
    select() { return this },
    sort(order) {
      result = [...result].sort((a, b) => (new Date(a.createdAt) - new Date(b.createdAt)) * order.createdAt)
      return this
    },
    limit(count) { result = result.slice(0, count); return this },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject) },
  }
}
function response() {
  return { statusCode: 200, payload: null, set() { return this }, status(code) { this.statusCode = code; return this }, json(payload) { this.payload = payload; return this } }
}
async function call(handler, req) {
  const res = response()
  await handler(req, res, (error) => { throw error })
  return res
}
function fixture(t) {
  const owner = { _id: id(), name: 'Owner' }
  const finder = { _id: id(), name: 'Finder' }
  const second = { _id: id(), name: 'Second finder' }
  const admin = { _id: id(), name: 'Admin', role: 'shelter_admin' }
  const pet = { _id: id(), name: 'Maple', reportedBy: owner._id, district: 'Sha Tin', species: 'Dog', breed: 'Retriever', phone: 'private-phone', locationName: 'private-door', location: { coordinates: [114, 22] } }
  const rows = new Map([[Pet, [pet]], [User, [owner, finder, second, admin]], [Message, []], [Notification, []], [UserBlock, []], [Stray, []], [StrayComment, []], [Sighting, []]])
  for (const [Model, documents] of rows) {
    t.mock.method(Model, 'find', (filter) => query(documents.filter((doc) => matches(doc, filter))))
    t.mock.method(Model, 'findOne', (filter) => query(documents.find((doc) => matches(doc, filter)) || null))
    t.mock.method(Model, 'exists', async (filter) => documents.find((doc) => matches(doc, filter)) || null)
  }
  const writes = []
  t.mock.method(Message, 'updateMany', async (filter, update) => {
    writes.push({ filter, update })
    assert.deepEqual(Object.keys(update), ['$addToSet'])
    for (const message of rows.get(Message).filter((doc) => matches(doc, filter))) {
      message.readBy ||= []
      if (!message.readBy.some((reader) => same(reader, update.$addToSet.readBy))) message.readBy.push(update.$addToSet.readBy)
    }
    return { acknowledged: true }
  })
  t.mock.method(Notification, 'findOneAndUpdate', async (filter, update) => {
    const doc = rows.get(Notification).find((item) => matches(item, filter))
    if (doc) Object.assign(doc, update.$set)
    return doc
  })
  t.mock.method(Notification, 'updateMany', async (filter, update) => {
    for (const doc of rows.get(Notification).filter((item) => matches(item, filter))) Object.assign(doc, update.$set)
    return { acknowledged: true }
  })
  function message(sender, participant = finder, extra = {}) {
    const doc = { _id: id(), pet: pet._id, participant: participant._id, sender, sentBy: sender === 'owner' ? owner._id : participant._id, text: 'Authored text', createdAt: new Date(1000 + rows.get(Message).length * 1000), ...extra }
    rows.get(Message).push(doc)
    return doc
  }
  function notification(messageDoc, recipient = owner, extra = {}) {
    const doc = { _id: id(), user: recipient._id, pet: pet._id, message: messageDoc?._id, type: 'message', title: 'Historical private title', body: 'Historical private-door private-phone', createdAt: new Date(), read: false, ...extra }
    rows.get(Notification).push(doc)
    return doc
  }
  const req = (user, body = {}) => ({ user, params: { petId: String(pet._id) }, query: {}, body })
  return { owner, finder, second, admin, pet, rows, writes, message, notification, req }
}

test('read schema is optional for legacy documents and acknowledgment route requires authentication and rate limiting', () => {
  const legacy = new Message({ pet: id(), sender: 'finder' })
  assert.equal(legacy.readBy, undefined)
  const route = chatRouter.stack.find((layer) => layer.route?.path === '/:petId/read')
  assert.deepEqual(route.route.stack.map((layer) => layer.handle.name), ['requireAuth', 'mutationRateLimit', 'markMessagesRead'])
  assert.equal(route.route.methods.patch, true)
})

test('inbox counts all incoming unread messages even when the latest message is outgoing; GET does not acknowledge', async (t) => {
  const f = fixture(t)
  const incoming = f.message('finder', f.finder, { sentBy: null })
  f.message('owner')
  f.message('finder', f.second, { readBy: [f.owner._id] })
  const inbox = await call(listConversations, f.req(f.owner))
  const first = inbox.payload.conversations.find((item) => item.pet.participantId === String(f.finder._id))
  assert.equal(first.unreadCount, 1)
  assert.equal(first.lastMessage.sender, 'owner')
  assert.equal(inbox.payload.conversations.find((item) => item.pet.participantId === String(f.second._id)).unreadCount, 0)
  await call(getMessages, { ...f.req(f.owner), query: { participantId: String(f.finder._id) } })
  assert.equal(f.writes.length, 0)
  assert.equal(incoming.readBy, undefined)
})

test('finder sees no unread for outgoing-only messages and reads are independent per account', async (t) => {
  const f = fixture(t)
  f.message('finder')
  assert.equal((await call(listConversations, f.req(f.finder))).payload.conversations[0].unreadCount, 0)
  const incoming = f.message('owner', f.finder, { readBy: [f.owner._id] })
  assert.equal((await call(listConversations, f.req(f.finder))).payload.conversations[0].unreadCount, 1)
  await call(markMessagesRead, f.req(f.finder, { messageIds: [String(incoming._id)] }))
  assert.equal((await call(listConversations, f.req(f.finder))).payload.conversations[0].unreadCount, 0)
})
test('authorized inbox supplies the public display name without a user-directory or private-profile payload', async t => {
  const f = fixture(t)
  f.owner.name = 'Public display name'
  f.owner.realName = 'Private identity sentinel'
  f.owner.email = 'private-email@example.test'
  f.pet.ownerName = 'Report contact label'
  f.message('finder')
  const result = await call(listConversations, f.req(f.finder))
  assert.equal(result.payload.conversations[0].pet.ownerDisplayName, 'Public display name')
  const serialized = JSON.stringify(result.payload)
  assert.ok(!serialized.includes('Private identity sentinel'))
  assert.ok(!serialized.includes('private-email@example.test'))
  assert.ok(!serialized.includes('private-phone'))
  assert.equal(result.payload.conversations.length, 1)
})

test('acknowledgment updates only explicit incoming IDs in the authorized thread and is idempotent', async (t) => {
  const f = fixture(t)
  const incoming = f.message('finder')
  const outgoing = f.message('owner')
  const otherThread = f.message('finder', f.second)
  const lateArrival = f.message('finder')
  const legacyUnknown = f.message('finder', f.finder, { participant: null })
  const body = { participantId: String(f.finder._id), messageIds: [incoming, outgoing, otherThread, legacyUnknown].map((doc) => String(doc._id)) }
  await call(markMessagesRead, f.req(f.owner, body))
  await call(markMessagesRead, f.req(f.owner, body))
  assert.deepEqual(incoming.readBy.map(String), [String(f.owner._id)])
  for (const doc of [outgoing, otherThread, lateArrival, legacyUnknown]) assert.equal(doc.readBy, undefined)
  assert.equal(f.writes[0].filter.sender, 'finder')
  assert.equal(f.writes[0].filter.participant, String(f.finder._id))
  assert.equal(f.writes[0].filter.pet, String(f.pet._id))
})

test('finder-supplied participant and admin role cannot acknowledge another thread', async (t) => {
  const f = fixture(t)
  const privateReply = f.message('owner', f.second)
  for (const user of [f.finder, f.admin]) {
    await call(markMessagesRead, f.req(user, { participantId: String(f.second._id), messageIds: [String(privateReply._id)] }))
    assert.equal(privateReply.readBy, undefined)
    assert.equal(String(f.writes.at(-1).filter.participant), String(user._id))
  }
  assert.equal((await call(markMessagesRead, f.req(f.owner, { messageIds: [String(privateReply._id)] }))).statusCode, 400)
})

test('read request validates list bounds and IDs before any write', async (t) => {
  const f = fixture(t)
  for (const messageIds of [undefined, [], ['invalid'], [123], Array(501).fill(String(id()))]) {
    const res = await call(markMessagesRead, f.req(f.finder, { messageIds }))
    assert.equal(res.statusCode, 400)
    assert.equal(res.payload.code, 'CHAT_READ_INVALID')
    assert.deepEqual(res.payload.params, { max: 500 })
  }
  assert.equal(f.writes.length, 0)
  assert.equal((await call(markMessagesRead, f.req(f.finder, { messageIds: Array(500).fill(String(id())) }))).statusCode, 200)
  assert.equal(f.writes[0].filter._id.$in.length, 1)
})

test('message validation preserves English compatibility and supplies stable localized error codes', async (t) => {
  const f = fixture(t)
  const missing = await call(createMessage, f.req(f.finder, { text: ' ' }))
  assert.equal(missing.statusCode, 400)
  assert.equal(missing.payload.code, 'CHAT_MESSAGE_REQUIRED')
  const long = await call(createMessage, f.req(f.finder, { text: 'a'.repeat(2001) }))
  assert.equal(long.payload.error, 'Message is too long.')
  assert.equal(long.payload.code, 'CHAT_MESSAGE_TOO_LONG')
  assert.deepEqual(long.payload.params, { max: 2000 })
})

test('hidden or blocked conversations cannot be acknowledged in either blocking direction', async (t) => {
  const f = fixture(t)
  const incoming = f.message('owner')
  const req = f.req(f.finder, { messageIds: [String(incoming._id)] })
  f.pet.moderationStatus = 'hidden'
  assert.equal((await call(markMessagesRead, req)).statusCode, 404)
  delete f.pet.moderationStatus
  for (const pair of [[f.owner, f.finder], [f.finder, f.owner]]) {
    f.rows.get(UserBlock).splice(0, Infinity, { blocker: pair[0]._id, blocked: pair[1]._id })
    assert.equal((await call(markMessagesRead, req)).statusCode, 403)
  }
  assert.equal(f.writes.length, 0)
})

test('notifications reconstruct correct multi-thread destinations and safe event data from authorized messages', async (t) => {
  const f = fixture(t)
  const first = f.message('finder')
  const second = f.message('finder', f.second, { sentBy: null })
  f.notification(first)
  f.notification(second)
  const res = await call(listNotifications, { user: f.owner })
  assert.equal(res.payload.notifications.length, 2)
  for (const message of [first, second]) {
    const item = res.payload.notifications.find((item) => item.conversation.messageId === String(message._id))
    assert.deepEqual(item.conversation, { petId: String(f.pet._id), participantId: String(message.participant), messageId: String(message._id) })
    assert.equal(item.event.code, 'message.text')
    assert.equal(item.event.params.text, message.text)
    assert.ok(item.createdAt)
    const serialized = JSON.stringify(item)
    for (const secret of ['private-door', 'private-phone', 'coordinates', 'Historical private']) assert.equal(serialized.includes(secret), false)
  }
})

test('message destinations reject unrelated/admin recipients, missing or mismatched references, and legacy unknown participants', async (t) => {
  const f = fixture(t)
  const valid = f.message('finder')
  f.notification(valid, f.admin)
  assert.deepEqual((await call(listNotifications, { user: f.admin })).payload.notifications, [])
  f.notification(null)
  f.notification(f.message('finder', f.finder, { participant: null }))
  f.notification(valid, f.owner, { pet: id() })
  f.notification(f.message('finder', f.finder, { sentBy: f.second._id }))
  assert.deepEqual((await call(listNotifications, { user: f.owner })).payload.notifications, [])
})

test('owner replies route to their participant and shared-post notification honors unavailable content', async (t) => {
  const f = fixture(t)
  const stray = { _id: id(), district: 'Sha Tin', active: true }
  f.rows.get(Stray).push(stray)
  const reply = f.message('owner', f.finder, { text: '', sharedStray: stray._id })
  f.notification(reply, f.finder, { stray: stray._id })
  let res = await call(listNotifications, { user: f.finder })
  assert.equal(res.payload.notifications[0].event.code, 'message.sharedPost')
  assert.equal(res.payload.notifications[0].conversation.participantId, String(f.finder._id))
  const photo = f.message('owner', f.finder, { text: '', photo: '/photo.jpg' })
  f.notification(photo, f.finder)
  assert.equal((await call(listNotifications, { user: f.finder })).payload.notifications.find((item) => item.conversation.messageId === String(photo._id)).event.code, 'message.photo')
  f.rows.get(Notification).pop()
  // A historical notification without its own stray pointer must not bypass visibility.
  delete f.rows.get(Notification)[0].stray
  stray.moderationStatus = 'hidden'
  res = await call(listNotifications, { user: f.finder })
  assert.deepEqual(res.payload.notifications, [])
})

test('list and mark-read both hide blocked legacy messages and notification reads never mark messages seen', async (t) => {
  const f = fixture(t)
  const incoming = f.message('finder', f.finder, { sentBy: null })
  const notification = f.notification(incoming)
  const request = { user: f.owner, params: { id: String(notification._id) } }
  assert.equal((await call(markRead, { ...request, user: f.admin })).statusCode, 404)
  assert.equal(notification.read, false)
  f.rows.get(UserBlock).push({ blocker: f.owner._id, blocked: f.finder._id })
  assert.deepEqual((await call(listNotifications, { user: f.owner })).payload.notifications, [])
  assert.equal((await call(markRead, request)).statusCode, 404)
  assert.equal(notification.read, false)
  f.rows.get(UserBlock).length = 0
  assert.equal((await call(markRead, request)).payload.notification.read, true)
  await call(markAllRead, { user: f.owner })
  assert.equal(incoming.readBy, undefined)
  assert.equal(f.writes.length, 0)
})

test('localized system events use safe parent fields and comments use visible authored text', async (t) => {
  const f = fixture(t)
  const stray = { _id: id(), district: 'Sha Tin', active: true }
  const comment = { _id: id(), stray: stray._id, author: f.finder._id, text: 'Actual comment' }
  f.rows.get(Stray).push(stray)
  f.rows.get(StrayComment).push(comment)
  for (const type of ['proximity', 'sighting', 'reunited']) f.notification(null, f.owner, { type })
  f.notification(null, f.owner, { type: 'comment', pet: null, stray: stray._id, comment: comment._id })
  const result = (await call(listNotifications, { user: f.owner })).payload.notifications
  assert.deepEqual(result.map((item) => item.event.code).sort(), ['comment', 'proximity', 'reunited', 'sighting'])
  assert.equal(result.find((item) => item.type === 'comment').event.params.text, 'Actual comment')
  assert.equal(result.find((item) => item.type === 'sighting').event.params.district, 'Sha Tin')
  assert.equal(JSON.stringify(result).includes('private-door'), false)
  comment.moderationStatus = 'hidden'
  assert.equal((await call(listNotifications, { user: f.owner })).payload.notifications.some((item) => item.type === 'comment'), false)
})

test('seeing a message derives read notification state, including notifications created after acknowledgment', async (t) => {
  const f = fixture(t)
  const incoming = f.message('finder')
  await call(markMessagesRead, f.req(f.owner, { participantId: String(f.finder._id), messageIds: [String(incoming._id)] }))
  const notification = f.notification(incoming)
  const res = await call(listNotifications, { user: f.owner })
  assert.equal(res.payload.notifications[0].read, true)
  assert.equal(notification.read, false) // derived, no extra notification write
  assert.equal(f.writes.length, 1)
})
