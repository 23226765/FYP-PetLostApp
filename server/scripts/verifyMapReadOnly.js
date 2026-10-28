// Local, read-only HTTP verification against existing petlostapp records.
// Does not import production startup or initialize collections/indexes.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import express from 'express'

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'), quiet: true })
process.env.ALLOW_TEST_SEED = 'false'
mongoose.set('autoCreate', false)
mongoose.set('autoIndex', false)
let server, writes = 0, stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
  await mongoose.disconnect()
  console.log(`READ_ONLY_MAP_STOPPED databaseWriteCommands=${writes}`)
  if (writes) process.exitCode = 1
}
try {
  const { requireJwtSecret } = await import('../config/security.js')
  requireJwtSecret()
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'petlostapp', autoCreate: false, autoIndex: false, monitorCommands: true, serverSelectionTimeoutMS: 10000 })
  if (mongoose.connection.name !== 'petlostapp') throw new Error('Unexpected database')
  mongoose.connection.getClient().on('commandStarted', event => {
    if (['insert', 'update', 'delete', 'findAndModify', 'create', 'createIndexes', 'drop', 'dropDatabase', 'dropIndexes', 'aggregateToCollection'].includes(event.commandName)) writes++
  })
  const { databaseHealth } = await import('../config/database.js')
  const { configureHttpSecurity, resolveHttpSecurityConfig } = await import('../config/httpSecurity.js')
  const { errorHandler } = await import('../middleware/errorHandler.js')
  const app = express()
  configureHttpSecurity(app, resolveHttpSecurityConfig())
  app.use((req, res, next) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? next() : res.status(405).json({ code: 'READ_ONLY_VERIFICATION' }))
  app.get('/api/health', async (_req, res) => {
    const db = await databaseHealth()
    res.status(db.connected ? 200 : 503).json({ status: db.connected ? 'ok' : 'degraded', ...db })
  })
  app.use('/api/pets', (await import('../routes/pets.js')).default)
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }))
  app.use(errorHandler)
  const port = Number(process.env.VERIFY_MAP_PORT || 5000)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid verification port')
  server = app.listen(port)
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  console.log(`READ_ONLY_MAP_READY http://localhost:${port} database=petlostapp autoCreate=false autoIndex=false`)
  process.once('SIGINT', () => void stop())
  process.once('SIGTERM', () => void stop())
} catch (error) {
  // Never expose driver/configuration objects, credentials or full errors.
  const codes = [...(error?.reason?.servers?.values?.() || [])]
    .flatMap(server => [server.error?.code, server.error?.cause?.code])
    .filter(code => typeof code === 'string' && /^[A-Z0-9_]+$/.test(code))
  console.error(`Read-only map verification startup failed (${error?.name || 'Error'}; codes=${[...new Set(codes)].join(',') || 'unavailable'}).`)
  process.exitCode = 1
  await stop()
}
