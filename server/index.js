import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import { errorHandler } from './middleware/errorHandler.js'
import {
  connectDatabase,
  databaseErrorMessage,
  databaseHealth,
  disconnectDatabase,
} from './config/database.js'
import { initializeApplicationCollections } from './config/collections.js'
import { requireJwtSecret, securityConfigurationMessage } from './config/security.js'

const serverDirectory = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(serverDirectory, '.env') })

// Authentication modules read JWT_SECRET during evaluation, so load routes
// only after the server-local environment file has been configured.
const [
  { default: petsRouter },
  { default: authRouter },
  { default: notificationsRouter },
  { default: chatRouter },
  { default: straysRouter },
  { default: matchesRouter },
  { default: analyticsRouter },
  { default: uploadsRouter },
] = await Promise.all([
  import('./routes/pets.js'),
  import('./routes/auth.js'),
  import('./routes/notifications.js'),
  import('./routes/chat.js'),
  import('./routes/strays.js'),
  import('./routes/matches.js'),
  import('./routes/analytics.js'),
  import('./routes/uploads.js'),
])

const app = express()
const PORT = Number(process.env.PORT) || 5000
let httpServer = null

const defaultOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]
const allowedOrigins = (process.env.CORS_ORIGINS || defaultOrigins.join(','))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
      const error = new Error('Origin is not allowed by CORS')
      error.status = 403
      callback(error)
    },
    credentials: true,
  }),
)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use('/uploads', express.static(path.resolve(serverDirectory, 'uploads'), {
  fallthrough: false,
  immutable: true,
  maxAge: '30d',
}))

app.get('/api/health', async (_req, res) => {
  const database = await databaseHealth()
  res.status(database.connected ? 200 : 503).json({
    status: database.connected ? 'ok' : 'degraded',
    db: database.connected ? 'connected' : 'disconnected',
    database: database.database,
    expectedDatabase: database.expectedDatabase,
    readyState: database.readyState,
  })
})

app.use('/api/pets', petsRouter)
app.use('/api/auth', authRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/chat', chatRouter)
app.use('/api/strays', straysRouter)
app.use('/api/matches', matchesRouter)
app.use('/api/analytics', analyticsRouter)
app.use('/api/uploads', uploadsRouter)

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))
app.use(errorHandler)

async function start() {
  try {
    requireJwtSecret()
  } catch (error) {
    console.error(`Security startup failed: ${securityConfigurationMessage(error)}`)
    process.exitCode = 1
    return
  }

  try {
    const connection = await connectDatabase()
    const collections = await initializeApplicationCollections(connection)
    console.log(`Initialized ${collections.length} PawRadar collections.`)
  } catch (error) {
    console.error(`Database startup failed: ${databaseErrorMessage(error)}`)
    process.exitCode = 1
    return
  }

  httpServer = app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`)
  })
  httpServer.on('error', async (error) => {
    console.error(`API startup failed (${error.code || 'unknown error'}).`)
    await disconnectDatabase().catch(() => undefined)
    process.exitCode = 1
  })
}

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down safely.`)
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve))
    httpServer = null
  }
  await disconnectDatabase()
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

void start()
