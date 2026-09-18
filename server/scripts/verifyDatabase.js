import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { initializeApplicationCollections } from '../config/collections.js'
import {
  connectDatabase,
  DATABASE_NAME,
  databaseErrorMessage,
  disconnectDatabase,
} from '../config/database.js'
import Pet from '../models/Pet.js'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(scriptDirectory, '../.env') })

const testRecordId = new mongoose.Types.ObjectId()
let inserted = false

async function verifyDatabase() {
  const connection = await connectDatabase()
  assert.equal(connection.name, DATABASE_NAME, 'Unexpected MongoDB database')

  await initializeApplicationCollections(connection)

  await Pet.create({
    _id: testRecordId,
    name: 'PawRadar database verification',
    species: 'Other',
    breed: 'Temporary system record',
    district: 'Central and Western',
    description: 'Temporary Atlas insert/read verification record.',
    status: 'sighted',
    locationName: 'PawRadar system check',
    location: { type: 'Point', coordinates: [114.1694, 22.3193] },
    lastSeen: new Date(),
  })
  inserted = true

  const readBack = await Pet.findById(testRecordId).lean()
  assert.ok(readBack, 'Temporary verification record could not be read back')
  assert.equal(readBack.name, 'PawRadar database verification')

  console.log(`Verified database: ${connection.name}`)
  console.log(`Verified collection: ${Pet.collection.name}`)
  console.log(`Verified record: ${testRecordId}`)
}

verifyDatabase()
  .catch((error) => {
    console.error(`Database verification failed: ${databaseErrorMessage(error)}`)
    process.exitCode = 1
  })
  .finally(async () => {
    if (inserted) {
      const cleanup = await Pet.deleteOne({ _id: testRecordId }).catch(() => null)
      console.log(`Temporary record removed: ${cleanup?.deletedCount === 1 ? 'yes' : 'no'}`)
    }
    await disconnectDatabase()
  })
