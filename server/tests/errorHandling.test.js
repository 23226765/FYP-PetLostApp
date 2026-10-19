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

test('validation responses expose stable fields and bounded constraints but never rejected values or messages', () => {
  const original = console.error
  console.error = () => {}
  try {
    for (const [kind, max, code] of [['required', undefined, 'FIELD_REQUIRED'], ['maxlength', 100, 'FIELD_TOO_LONG'], ['maxlength', Infinity, 'FIELD_INVALID']]) {
      const response = responseRecorder()
      errorHandler({ name: 'ValidationError', errors: { realName: { kind, value: 'private-name', message: 'private-name', properties: { maxlength: max } } } }, {}, response, () => {})
      assert.equal(response.statusCode, 400)
      assert.equal(response.payload.code, code)
      assert.equal(response.payload.field, 'realName')
      if (code === 'FIELD_TOO_LONG') assert.deepEqual(response.payload.params, { max: 100 })
      assert.equal(JSON.stringify(response.payload).includes('private-name'), false)
    }
  } finally { console.error = original }
})

test('registration and profile validation return localizable codes and useful limits before database access', async () => {
  const { register, updateMe } = await import('../controllers/authController.js')
  const cases = [
    [register, { name: 'Fictional', email: 'invalid-email', password: 'fictional-password' }, 'EMAIL_INVALID', 'email', undefined],
    [register, { name: 'Fictional', email: 'fictional@example.test', password: 'short' }, 'PASSWORD_TOO_SHORT', 'password', { min: 6 }],
    [updateMe, { name: '' }, 'FIELD_REQUIRED', 'name', { max: 100 }],
    [updateMe, { realName: 'x'.repeat(101) }, 'FIELD_TOO_LONG', 'realName', { max: 100 }],
    [updateMe, { phone: '1'.repeat(31) }, 'FIELD_TOO_LONG', 'phone', { max: 30 }],
  ]
  for (const [handler, body, code, field, params] of cases) {
    const response = responseRecorder()
    await handler({ body }, response, error => { throw error })
    assert.equal(response.statusCode, 400)
    assert.equal(response.payload.code, code)
    assert.equal(response.payload.field, field)
    assert.deepEqual(response.payload.params, params)
    assert.equal(JSON.stringify(response.payload).includes('fictional-password'), false)
  }
})
