import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import petsRouter from './routes/pets.js'
import authRouter from './routes/auth.js'
import notificationsRouter from './routes/notifications.js'
import chatRouter from './routes/chat.js'
import straysRouter from './routes/strays.js'
import { errorHandler } from './middleware/errorHandler.js'

const app = express()
const PORT = Number(process.env.PORT) || 5000
const MONGODB_URI = process.env.MONGODB_URI

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
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
  }),
)
app.use(express.json({ limit: '2mb' }))

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
