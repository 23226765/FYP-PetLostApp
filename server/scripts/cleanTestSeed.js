import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import {
  connectDatabase,
  DATABASE_NAME,
  databaseErrorMessage,
  disconnectDatabase,
} from '../config/database.js'
import Message from '../models/Message.js'
import Notification from '../models/Notification.js'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import Stray from '../models/Stray.js'
import User from '../models/User.js'
import StrayComment from '../models/StrayComment.js'
import SavedStray from '../models/SavedStray.js'

const SEED_BATCH = 'fyp-demo-v1'
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(scriptDirectory, '../.env') })

function assertCleanupAllowed() {
  if (process.env.NODE_ENV === 'production') {
    const error = new Error('Test seed cleanup is disabled when NODE_ENV=production.')
    error.code = 'TEST_SEED_CLEAN_DISABLED_IN_PRODUCTION'
    throw error
  }
  if (process.env.ALLOW_TEST_SEED !== 'true') {
    const error = new Error('Test seed cleanup refused. Set ALLOW_TEST_SEED=true in server/.env.')
    error.code = 'TEST_SEED_CLEAN_NOT_ALLOWED'
    throw error
  }
}

async function run() {
  assertCleanupAllowed()
  const connection = await connectDatabase()
  if (connection.name !== DATABASE_NAME) {
    const error = new Error(`Test seed cleanup refused outside "${DATABASE_NAME}".`)
    error.code = 'TEST_SEED_CLEAN_DATABASE_MISMATCH'
    throw error
  }

  const models = [
    ['notifications', Notification],
    ['messages', Message],
    ['savedstrays', SavedStray],
    ['straycomments', StrayComment],
    ['sightings', Sighting],
    ['strays', Stray],
    ['pets', Pet],
    ['users', User],
  ]

  console.log(`Cleaning seed batch: ${SEED_BATCH}`)
  for (const [collection, Model] of models) {
    const result = await Model.deleteMany({ seedBatch: SEED_BATCH })
    console.log(`${collection}: removed=${result.deletedCount}`)
  }
}

run()
  .catch((error) => {
    const message = String(error?.code || '').startsWith('TEST_SEED_')
      ? error.message
      : databaseErrorMessage(error)
    console.error(`Test seed cleanup failed: ${message}`)
    process.exitCode = 1
  })
  .finally(() => disconnectDatabase())
