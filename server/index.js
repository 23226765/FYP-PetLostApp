import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import petsRouter from './routes/pets.js'
import { errorHandler } from './middleware/errorHandler.js'

const app = express()
const PORT = Number(process.env.PORT) || 5000
const MONGODB_URI = process.env.MONGODB_URI

app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.get('/api/health', (_req, res) => {
  const state = mongoose.connection.readyState
  res.json({
    status: 'ok',
    db: state === 1 ? 'connected' : 'disconnected',
    readyState: state,
  })
})

app.use('/api/pets', petsRouter)

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