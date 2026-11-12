import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import Notification from '../models/Notification.js'
import Pet from '../models/Pet.js'
import Stray from '../models/Stray.js'
import UserBlock from '../models/UserBlock.js'
import User from '../models/User.js'
import { createRadiusNotifications, listNotifications } from '../controllers/notificationController.js'

test('historical location notification bodies are rebuilt with district-only text', async () => {
  const originalNotificationFind = Notification.find
  const originalPetFind = Pet.find
  const originalStrayFind = Stray.find
  const originalUserBlockFind = UserBlock.find
  const userId = new mongoose.Types.ObjectId()
  const petId = new mongoose.Types.ObjectId()
  const notification = {
    _id: new mongoose.Types.ObjectId(),
    user: userId,
    pet: petId,
    type: 'sighting',
    title: 'Private Reporter sighted Maple',
    body: 'Private Reporter (+852 5555 0199) spotted Maple at Exact fountain entrance, Sha Tin Park.',
    reportedBy: new mongoose.Types.ObjectId(), reporterName: 'Private Reporter', reporterPhone: '+852 5555 0199',
    event: { params: { reporterName: 'Private Reporter', reporterPhone: '+852 5555 0199' } },
    createdAt: new Date(),
    read: false,
  }

  try {
    Notification.find = () => ({
      sort() { return this },
      limit: async () => [notification],
    })
    Pet.find = () => ({
      select: async () => [{
        _id: petId,
        name: 'Maple',
        species: 'Dog',
        breed: 'Golden Retriever',
        district: 'Sha Tin',
      }],
    })
    Stray.find = () => ({ select: async () => [] })
    UserBlock.find = () => ({ select: async () => [] })
    const response = {
      payload: null,
      set() { return this },
      json(payload) { this.payload = payload; return this },
    }

    await listNotifications(
      { user: { _id: userId } },
      response,
      (error) => { throw error },
    )

    assert.equal(response.payload.notifications[0].body, 'Maple was spotted in Sha Tin.')
    assert.equal(response.payload.notifications[0].body.includes('fountain'), false)
    const serialized = JSON.stringify(response.payload)
    for (const forbidden of ['Private Reporter', '+852 5555 0199', String(notification.reportedBy), 'reporterName', 'reporterPhone', 'reportedBy']) assert.equal(serialized.includes(forbidden), false, forbidden)
    assert.equal(response.payload.notifications[0].title, 'New sighting of Maple')
  } finally {
    Notification.find = originalNotificationFind
    Pet.find = originalPetFind
    Stray.find = originalStrayFind
    UserBlock.find = originalUserBlockFind
  }
})

test('new sighting notifications persist anonymous text and no reporter metadata', async () => {
  const originalAggregate = User.aggregate, originalBulkWrite = Notification.bulkWrite
  const reporterId = new mongoose.Types.ObjectId(), ownerId = new mongoose.Types.ObjectId()
  const pet = { _id: new mongoose.Types.ObjectId(), reportedBy: ownerId, name: 'Maple', district: 'Sha Tin' }
  const sighting = { _id: new mongoose.Types.ObjectId(), reportedBy: reporterId, reporterName: 'Private Reporter', reporterPhone: '+852 5555 0199', note: 'User note preserved internally' }
  let writes
  try {
    User.aggregate = async () => []
    Notification.bulkWrite = async (operations) => { writes = operations }
    await createRadiusNotifications({ pet, sighting, type: 'sighting', origin: [114.19, 22.38], excludeUserId: reporterId })
    assert.equal(writes.length, 1)
    const document = writes[0].updateOne.update.$setOnInsert
    assert.equal(String(document.user), String(ownerId))
    assert.equal(document.body, 'Maple was spotted in Sha Tin.')
    const serialized = JSON.stringify(writes)
    for (const forbidden of ['Private Reporter', '+852 5555 0199', String(reporterId), 'reporterName', 'reporterPhone', 'reportedBy']) assert.equal(serialized.includes(forbidden), false, forbidden)
  } finally { User.aggregate = originalAggregate; Notification.bulkWrite = originalBulkWrite }
})
