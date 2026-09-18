import mongoose from 'mongoose'

export const DATABASE_NAME = 'petlostapp'

const CONNECTION_OPTIONS = Object.freeze({
  dbName: DATABASE_NAME,
  serverSelectionTimeoutMS: 10_000,
  maxPoolSize: 10,
  minPoolSize: 0,
  autoIndex: true,
})

let connectionPromise = null
let listenersAttached = false

function databaseNameFor(connection) {
  return connection?.name || connection?.db?.databaseName || ''
}

function assertExpectedDatabase(connection) {
  const actualDatabase = databaseNameFor(connection)
  if (actualDatabase !== DATABASE_NAME) {
    const error = new Error('MongoDB connected to an unexpected database.')
    error.code = 'DATABASE_NAME_MISMATCH'
    error.actualDatabase = actualDatabase
    throw error
  }
}

function configuredUri(value) {
  const uri = typeof value === 'string' ? value.trim() : ''
  if (!uri) {
    const error = new Error('MONGODB_URI is not configured in server/.env.')
    error.code = 'MONGODB_URI_MISSING'
    throw error
  }
  if (!/^mongodb(?:\+srv)?:\/\//i.test(uri)) {
    const error = new Error('MONGODB_URI must be a MongoDB connection string.')
    error.code = 'MONGODB_URI_INVALID'
    throw error
  }
  return uri
}

function attachConnectionListeners() {
  if (listenersAttached) return
  listenersAttached = true
  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB connection closed.')
  })
}

export function databaseErrorMessage(error) {
  const code = error?.code ?? error?.codeName
  const message = String(error?.message || '').toLowerCase()

  if (code === 'MONGODB_URI_MISSING') return 'MONGODB_URI is not configured in server/.env.'
  if (code === 'MONGODB_URI_INVALID') return 'MONGODB_URI is not a valid MongoDB URI.'
  if (code === 'DATABASE_NAME_MISMATCH') {
    return `MongoDB must connect to the "${DATABASE_NAME}" database.`
  }
  if (
    code === 18 ||
    code === 'AuthenticationFailed' ||
    message.includes('authentication failed') ||
    message.includes('bad auth')
  ) {
    return 'MongoDB Atlas authentication failed. Check the database username and password.'
  }
  if (message.includes('enotfound') || message.includes('getaddrinfo')) {
    return 'MongoDB Atlas host could not be resolved. Check the cluster connection string.'
  }
  if (message.includes('server selection') || message.includes('timed out')) {
    return 'MongoDB Atlas could not be reached. Check Network Access and the connection string.'
  }
  return 'MongoDB Atlas connection failed. Check server/.env and Atlas access settings.'
}

export async function connectDatabase(uri = process.env.MONGODB_URI) {
  if (mongoose.connection.readyState === 1) {
    assertExpectedDatabase(mongoose.connection)
    return mongoose.connection
  }
  if (connectionPromise) return connectionPromise

  const safeUri = configuredUri(uri)
  attachConnectionListeners()
  connectionPromise = mongoose.connect(safeUri, CONNECTION_OPTIONS)

  try {
    await connectionPromise
    assertExpectedDatabase(mongoose.connection)
    await mongoose.connection.db.admin().command({ ping: 1 })
    console.log(`Connected to MongoDB Atlas database "${DATABASE_NAME}".`)
    return mongoose.connection
  } catch (error) {
    await mongoose.disconnect().catch(() => undefined)
    throw error
  } finally {
    connectionPromise = null
  }
}

export async function databaseHealth() {
  const readyState = mongoose.connection.readyState
  const actualDatabase = databaseNameFor(mongoose.connection)
  if (readyState !== 1 || !mongoose.connection.db) {
    return {
      connected: false,
      readyState,
      database: actualDatabase || DATABASE_NAME,
      expectedDatabase: DATABASE_NAME,
    }
  }

  try {
    assertExpectedDatabase(mongoose.connection)
    await mongoose.connection.db.admin().command({ ping: 1 })
    return {
      connected: true,
      readyState,
      database: actualDatabase,
      expectedDatabase: DATABASE_NAME,
    }
  } catch {
    return {
      connected: false,
      readyState,
      database: actualDatabase || DATABASE_NAME,
      expectedDatabase: DATABASE_NAME,
    }
  }
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect()
}
