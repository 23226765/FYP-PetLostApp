import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DATABASE_NAME,
  connectDatabase,
  databaseErrorMessage,
} from '../config/database.js'
import { APPLICATION_COLLECTIONS } from '../config/collections.js'
import Message from '../models/Message.js'
import Notification from '../models/Notification.js'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import Stray from '../models/Stray.js'
import User from '../models/User.js'

test('database configuration always selects the expected Atlas database', () => {
  assert.equal(DATABASE_NAME, 'petlostapp')
})

test('database connection fails safely when MONGODB_URI is absent', async () => {
  await assert.rejects(
    connectDatabase(''),
    (error) => error.code === 'MONGODB_URI_MISSING',
  )
})

test('database startup errors never expose a MongoDB URI', () => {
  const message = databaseErrorMessage(
    new Error('Unable to connect to mongodb+srv://private-user:private-password@example.test/db'),
  )
  assert.equal(message.includes('private-password'), false)
  assert.equal(message.includes('mongodb+srv://'), false)
})

test('application models map only to PawRadar collections', () => {
  const modelCollections = [User, Pet, Sighting, Stray, Message, Notification].map(
    (model) => model.collection.name,
  )
  assert.deepEqual(modelCollections, APPLICATION_COLLECTIONS)
})

test('all application models use timestamps', () => {
  for (const model of [User, Pet, Sighting, Stray, Message, Notification]) {
    assert.equal(model.schema.options.timestamps, true)
  }
})

test('all location-bearing models declare a 2dsphere index', () => {
  const indexedPaths = [
    [User, 'alertLocation'],
    [Pet, 'location'],
    [Sighting, 'location'],
    [Stray, 'location'],
  ]

  for (const [model, path] of indexedPaths) {
    const hasIndex = model.schema
      .indexes()
      .some(([fields]) => fields[path] === '2dsphere')
    assert.equal(hasIndex, true, `${model.modelName}.${path} is missing its 2dsphere index`)
  }
})
