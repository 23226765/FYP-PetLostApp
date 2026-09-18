import Message from '../models/Message.js'
import Notification from '../models/Notification.js'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import Stray from '../models/Stray.js'
import User from '../models/User.js'
import SavedStray from '../models/SavedStray.js'
import StrayComment from '../models/StrayComment.js'
import { DATABASE_NAME } from './database.js'

export const APPLICATION_COLLECTIONS = Object.freeze([
  'users',
  'pets',
  'sightings',
  'strays',
  'messages',
  'notifications',
  'straycomments',
  'savedstrays',
])

const applicationModels = Object.freeze([
  User,
  Pet,
  Sighting,
  Stray,
  Message,
  Notification,
  StrayComment,
  SavedStray,
])

export async function initializeApplicationCollections(connection) {
  const actualDatabase = connection?.name || connection?.db?.databaseName
  if (actualDatabase !== DATABASE_NAME) {
    throw new Error(`Refusing to initialize collections outside "${DATABASE_NAME}".`)
  }

  const existingCollections = new Set(
    (await connection.db.listCollections({}, { nameOnly: true }).toArray()).map(
      ({ name }) => name,
    ),
  )

  for (const model of applicationModels) {
    if (!APPLICATION_COLLECTIONS.includes(model.collection.name)) {
      throw new Error(`Unexpected application collection: ${model.collection.name}`)
    }
    try {
      if (!existingCollections.has(model.collection.name)) await model.createCollection()
      await model.createIndexes()
    } catch (cause) {
      const error = new Error(`Unable to initialize application collection "${model.collection.name}".`)
      error.code = 'COLLECTION_INITIALIZATION_FAILED'
      error.collection = model.collection.name
      error.cause = cause
      throw error
    }
  }

  return [...APPLICATION_COLLECTIONS]
}
