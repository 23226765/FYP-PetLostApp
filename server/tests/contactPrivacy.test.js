import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import User from '../models/User.js'
import { updatePrivacy } from '../controllers/authController.js'
import {
  canViewContact,
  contactVisibilityFor,
  serializeContact,
} from '../services/contactPrivacy.js'

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.payload = payload
      return this
    },
  }
}

test('new and legacy users default contact visibility to private', () => {
  const user = new User({
    name: 'Test User',
    email: 'privacy-default@example.test',
    password: 'not-a-real-password-hash',
  })
  assert.equal(user.privacy.contactVisibility, 'private')
  assert.equal(contactVisibilityFor({}), 'private')
})

test('anonymous and authenticated requesters receive contact only when permitted', () => {
  const ownerId = new mongoose.Types.ObjectId()
  const viewerId = new mongoose.Types.ObjectId()
  const visibleOwner = {
    _id: ownerId,
    phone: '+852 5555 0101',
    privacy: { contactVisibility: 'authenticated' },
  }
  const privateOwner = {
    ...visibleOwner,
    privacy: { contactVisibility: 'private' },
  }

  assert.equal(canViewContact(null, visibleOwner), false)
  assert.deepEqual(serializeContact({ requester: null, contactOwner: visibleOwner }), {
    canViewContact: false,
  })
  assert.deepEqual(
    serializeContact({ requester: { _id: viewerId }, contactOwner: visibleOwner }),
    { canViewContact: true, phone: '+852 5555 0101' },
  )
  const privateResult = serializeContact({
    requester: { _id: viewerId },
    contactOwner: privateOwner,
  })
  assert.deepEqual(privateResult, { canViewContact: false })
  assert.equal(JSON.stringify(privateResult).includes('+852'), false)
  assert.deepEqual(serializeContact({ requester: { _id: ownerId }, contactOwner: privateOwner }), {
    canViewContact: true,
    phone: '+852 5555 0101',
  })
})

test('privacy update accepts only the supported field and values', async () => {
  const user = {
    _id: new mongoose.Types.ObjectId(),
    privacy: { contactVisibility: 'private' },
    async save() {},
  }
  const response = responseRecorder()
  await updatePrivacy(
    { user, body: { contactVisibility: 'authenticated' } },
    response,
    (error) => { throw error },
  )
  assert.equal(response.statusCode, 200)
  assert.equal(response.payload.privacy.contactVisibility, 'authenticated')

  for (const body of [
    { contactVisibility: 'public' },
    { contactVisibility: 'private', phone: '+852 5000 0000' },
    {},
  ]) {
    const invalidResponse = responseRecorder()
    await updatePrivacy(
      { user, body },
      invalidResponse,
      (error) => { throw error },
    )
    assert.equal(invalidResponse.statusCode, 400)
  }
})
