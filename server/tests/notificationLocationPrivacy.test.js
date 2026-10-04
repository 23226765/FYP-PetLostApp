import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import Notification from '../models/Notification.js'
import Pet from '../models/Pet.js'
import Stray from '../models/Stray.js'
import UserBlock from '../models/UserBlock.js'
import { listNotifications } from '../controllers/notificationController.js'

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
    title: 'New sighting of Maple',
    body: 'Maple was spotted at Exact fountain entrance, Sha Tin Park.',
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
  } finally {
    Notification.find = originalNotificationFind
    Pet.find = originalPetFind
    Stray.find = originalStrayFind
    UserBlock.find = originalUserBlockFind
  }
})
