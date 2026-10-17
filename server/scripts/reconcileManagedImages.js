import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { createMediaReconciler } from '../services/mediaReconciliation.js'
import { DATABASE_NAME } from '../config/database.js'

const args = process.argv.slice(2)
const ids = args.filter((arg) => arg.startsWith('--asset-id=')).map((arg) => arg.slice('--asset-id='.length))
const apply = args.includes('--apply'), allowDelete = args.includes('--delete-confirmed-orphans')
if (!ids.length || ids.length > 25 || ids.some((id) => !/^[a-f0-9]{24}$/i.test(id))
  || args.some((arg) => !arg.startsWith('--asset-id=') && !['--apply', '--delete-confirmed-orphans'].includes(arg))
  || (allowDelete && !apply)) {
  console.error('No action taken. Supply 1–25 exact --asset-id=<MongoDB ID> values. Dry-run is the default.')
  process.exitCode = 1
} else {
  dotenv.config({ path: new URL('../.env', import.meta.url) })
  if (apply && process.env.ALLOW_MEDIA_RECONCILIATION !== 'true') {
    console.error('No action taken. Apply requires separate authorization and ALLOW_MEDIA_RECONCILIATION=true.')
    process.exitCode = 1
  } else {
    try {
      // Do not call normal startup: even dry-run must never create/index models.
      await mongoose.connect(process.env.MONGODB_URI, { dbName: DATABASE_NAME, autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000 })
      if (mongoose.connection.name !== 'petlostapp') throw new Error('Unexpected database')
      console.log(JSON.stringify(await createMediaReconciler()(ids, { apply, allowDelete })))
    } catch { console.error('Reconciliation unavailable; connection/provider details withheld.'); process.exitCode = 1 }
    finally { await mongoose.disconnect() }
  }
}
