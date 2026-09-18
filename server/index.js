import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import { errorHandler } from './middleware/errorHandler.js'

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
] = await Promise.all([
  import('./routes/pets.js'),
  import('./routes/auth.js'),
  import('./routes/notifications.js'),
  import('./routes/chat.js'),
  import('./routes/strays.js'),
  import('./routes/matches.js'),
])

const app = express()
const PORT = Number(process.env.PORT) || 5000
const MONGODB_URI = process.env.MONGODB_URI

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

app.get('/api/health', (_req, res) => {
  const state = mongoose.connection.readyState
  res.status(state === 1 ? 200 : 503).json({
    status: state === 1 ? 'ok' : 'degraded',
    db: state === 1 ? 'connected' : 'disconnected',
    readyState: state,
  })
})

app.use('/api/pets', petsRouter)
app.use('/api/auth', authRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/chat', chatRouter)
app.use('/api/strays', straysRouter)
app.use('/api/matches', matchesRouter)

app.use((_req, res) => res.status(404).json({ error: 'Not found' }))
app.use(errorHandler)

async function start() {
  if (!MONGODB_URI) {
    console.warn(
      '⚠️  MONGODB_URI is not set. API will start, but DB endpoints will fail. ' +
      'Add your Cosmos DB connection string to server/.env'
    )
  } else {
    try {
      await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 })
      console.log('✅ Connected to MongoDB (Cosmos DB)')
    } catch (err) {
      console.error('❌ MongoDB connection failed:', err.message)
    }
  }
  app.listen(PORT, () => console.log(`🚀 API listening on http://localhost:${PORT}`))
}

start()
