import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { authorizeMediaDestination, attachedImageForViewer } from '../services/mediaAccess.js'
import { mediaContentUrl } from '../services/mediaAttachments.js'

const id = () => String(new mongoose.Types.ObjectId())
const owner = { _id: id(), role: 'user' }, reporter = { _id: id(), role: 'user' }, unrelated = { _id: id(), role: 'user' }, admin = { _id: id(), role: 'shelter_admin' }
function fixture(type) {
  const assetId = id(), docId = id(), petId = id()
  const pet = { _id: petId, reportedBy: owner._id }
  const doc = { _id: docId, reportedBy: reporter._id, pet: petId, participant: reporter._id, sentBy: reporter._id,
    avatar: mediaContentUrl(assetId), photo: mediaContentUrl(assetId) }
  const asset = { _id: assetId, state: 'attached', attachedTo: { type, id: docId }, bytes: 10 }
  const query = (getter) => ({ select() { return this }, lean() { return this }, session() { return this }, then(resolve, reject) { return Promise.resolve().then(getter).then(resolve, reject) } })
  function model(row) { return { findOne(filter) { return query(() => row && String(filter._id) === String(row._id) && !(filter.moderationStatus && row.moderationStatus === 'hidden') ? row : null) } } }
  const models = { [type]: model(doc), pet: type === 'pet' ? model(doc) : model(pet) }
  let blocked = false
  const options = { models, blocks: async () => blocked }
  const Assets = { findOne(filter) { return query(() => String(filter._id) === assetId && filter.state === asset.state ? asset : null) } }
  return { assetId, doc, pet, asset, blocked: () => { blocked = true }, authorize: (user) => authorizeMediaDestination(type, docId, user, options),
    read: (user) => attachedImageForViewer(assetId, user, { Assets, authorize: (t, d, u) => authorizeMediaDestination(t, d, u, options) }) }
}

for (const type of ['user', 'pet', 'stray']) {
  test(`${type}: ordinary visible images support guest discovery without exposing metadata`, async () => {
    const f = fixture(type)
    for (const user of [undefined, owner, reporter, unrelated, admin]) assert.equal((await f.read(user))._id, f.assetId)
  })
}
test('sighting images are private to the pet owner and reporter, with no general admin bypass', async () => {
  const f = fixture('sighting')
  for (const user of [owner, reporter]) assert.equal((await f.read(user))._id, f.assetId)
  for (const user of [undefined, unrelated, admin]) await assert.rejects(f.read(user), { code: 'IMAGE_NOT_FOUND' })
})
test('message images require conversation membership and an unblocked relationship', async () => {
  const f = fixture('message')
  for (const user of [owner, reporter]) await f.read(user)
  for (const user of [undefined, unrelated, admin]) await assert.rejects(f.read(user), { code: 'IMAGE_NOT_FOUND' })
  f.blocked()
  for (const user of [owner, reporter]) await assert.rejects(f.read(user), { code: 'IMAGE_NOT_FOUND' })
})
for (const type of ['pet', 'sighting', 'stray', 'message']) {
  test(`${type}: hidden or inactive targets deny delivery even to their author`, async () => {
    const f = fixture(type)
    if (type === 'message') f.pet.moderationStatus = 'hidden'; else f.doc.moderationStatus = 'hidden'
    for (const user of [undefined, owner, reporter, unrelated, admin]) await assert.rejects(f.read(user), { code: 'IMAGE_NOT_FOUND' })
    if (type === 'stray') { f.doc.moderationStatus = undefined; f.doc.active = false; await assert.rejects(f.read(reporter), { code: 'IMAGE_NOT_FOUND' }) }
  })
}
test('hidden pet suppresses sighting image delivery, and restored content becomes available', async () => {
  const f = fixture('sighting'); f.pet.moderationStatus = 'hidden'
  await assert.rejects(f.read(owner), { code: 'IMAGE_NOT_FOUND' })
  f.pet.moderationStatus = 'visible'
  await f.read(owner)
})
test('detached references and retired assets cannot be viewed through stale URLs', async () => {
  const f = fixture('pet')
  f.doc.photo = ''
  await assert.rejects(f.read(owner), { code: 'IMAGE_NOT_FOUND' })
  f.doc.photo = mediaContentUrl(f.assetId); f.asset.state = 'delete_pending'
  await assert.rejects(f.read(owner), { code: 'IMAGE_NOT_FOUND' })
})

test('unsupported and prototype destination names return unavailable without accessing a model', async () => {
  for (const type of ['unknown', '__proto__', 'constructor', 'toString']) {
    await assert.rejects(authorizeMediaDestination(type, id(), owner), { code: 'IMAGE_NOT_FOUND' })
  }
})
