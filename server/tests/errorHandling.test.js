import test from 'node:test'
import assert from 'node:assert/strict'
import {
  errorHandler,
  logServerError,
  safeErrorMetadata,
} from '../middleware/errorHandler.js'

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.payload = payload
      return this
    },
  }
}

test('safe error metadata omits messages, configuration, and driver objects', () => {
  const error = Object.assign(new Error('mongodb+srv://user:secret@example.test/database'), {
    code: 'SERVER_SELECTION_FAILED',
    config: { uri: 'mongodb+srv://user:secret@example.test/database' },
    request: { headers: { authorization: 'Bearer private-token' } },
  })

  const metadata = safeErrorMetadata(error)
  const serialized = JSON.stringify(metadata)
  assert.deepEqual(metadata, {
    name: 'Error',
    code: 'SERVER_SELECTION_FAILED',
    status: undefined,
  })
  assert.equal(serialized.includes('secret'), false)
  assert.equal(serialized.includes('private-token'), false)
  assert.equal(serialized.includes('mongodb+srv'), false)
})

test('central error logging emits only sanitized metadata and a query-free path', () => {
  const calls = []
  const original = console.error
  console.error = (...args) => calls.push(args)
  try {
    const response = responseRecorder()
    errorHandler(
      Object.assign(new Error('private driver detail'), { code: 'DRIVER_FAILURE' }),
      { method: 'GET', path: '/api/pets' },
      response,
      () => {},
    )
    assert.equal(response.statusCode, 500)
    assert.deepEqual(response.payload, { error: 'Internal server error' })
  } finally {
    console.error = original
  }

  const serialized = JSON.stringify(calls)
  assert.equal(serialized.includes('private driver detail'), false)
  assert.equal(serialized.includes('DRIVER_FAILURE'), true)
  assert.equal(serialized.includes('/api/pets'), true)
})

test('notification logging uses the same sanitized representation', () => {
  const calls = []
  const original = console.error
  console.error = (...args) => calls.push(args)
  try {
    logServerError('Notification delivery failed', {
      name: 'MongoError',
      code: 18,
      message: 'contains a private connection string',
      config: { password: 'private-password' },
    })
  } finally {
    console.error = original
  }

  const serialized = JSON.stringify(calls)
  assert.equal(serialized.includes('private connection string'), false)
  assert.equal(serialized.includes('private-password'), false)
  assert.equal(serialized.includes('Notification delivery failed'), true)
})
