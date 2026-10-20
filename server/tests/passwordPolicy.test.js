import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import bcrypt from 'bcryptjs'
import express from 'express'
import { once } from 'node:events'
import User from '../models/User.js'
import authRoutes from '../routes/auth.js'
import { register, login } from '../controllers/authController.js'
import { validateNewPassword } from '../services/passwordPolicy.js'
import { resetLoginRateLimitForTests } from '../services/loginRateLimit.js'

const cases = [
  ['ASCII below', 'a'.repeat(71), 71], ['ASCII at', 'a'.repeat(72), 72], ['ASCII above', 'a'.repeat(73), 73],
  ['CJK below', '虎'.repeat(23) + 'ab', 71], ['CJK at', '虎'.repeat(24), 72], ['CJK above', '虎'.repeat(24) + 'a', 73],
  ['emoji below', '🐾'.repeat(17) + 'abc', 71], ['emoji at', '🐾'.repeat(18), 72], ['emoji above', '🐾'.repeat(18) + 'a', 73],
  ['split CJK boundary', 'a'.repeat(70) + '虎', 73],
]

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this }, json(value) { this.payload = value; return this } }
}
const fixture = { _id: '000000000000000000000020', name: 'Fictional fixture', email: 'password-fixture@example.test' }
const request = (password) => ({ body: { ...fixture, password }, ip: '127.0.0.20' })

test('new-password policy matches real bcrypt UTF-8 truncation boundaries', async (t) => {
  for (const [label, password, bytes] of cases) {
    await t.test(label, () => {
      assert.equal(Buffer.byteLength(password, 'utf8'), bytes)
      assert.equal(bcrypt.truncates(password), bytes > 72)
      const result = validateNewPassword(password)
      if (bytes > 72) assert.deepEqual(result, { error: 'Password must be 72 UTF-8 bytes or fewer.', code: 'PASSWORD_TOO_LONG', field: 'password', params: { maxBytes: 72 } })
      else assert.equal(result, null)
    })
  }
})

test('registration rejects oversized input before lookup, real hashing or persistence', async (t) => {
  t.mock.method(User, 'findOne', () => { throw new Error('Unexpected lookup') })
  t.mock.method(User, 'create', () => { throw new Error('Unexpected persistence') })
  t.mock.method(bcrypt, 'hash', () => { throw new Error('Unexpected hashing') })
  for (const [, password, bytes] of cases.filter((entry) => entry[2] > 72)) {
    const res = response()
    await register(request(password), res, (error) => { throw error })
    assert.equal(res.statusCode, 400)
    assert.equal(res.payload.code, 'PASSWORD_TOO_LONG')
    assert.equal(res.payload.field, 'password')
    assert.equal(res.payload.params.maxBytes, 72)
    assert.equal(JSON.stringify(res.payload).includes(password), false)
    assert.equal(bytes > 72, true)
  }
  assert.equal(User.findOne.mock.callCount(), 0)
  assert.equal(User.create.mock.callCount(), 0)
  assert.equal(bcrypt.hash.mock.callCount(), 0)
})

test('registration hashes accepted raw passwords with real bcrypt, including unchanged Unicode and whitespace', async (t) => {
  const previous = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'isolated-password-policy-fixture-signing-key-only-2026'
  t.after(() => { if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous })
  t.mock.method(User, 'findOne', async () => null)
  let persisted
  t.mock.method(User, 'create', async (value) => { persisted = value; return { ...fixture, ...value } })
  for (const password of [...cases.filter((entry) => entry[2] <= 72).map((entry) => entry[1]), '  e\u0301-unchanged  ']) {
    const res = response()
    await register(request(password), res, (error) => { throw error })
    assert.equal(res.statusCode, 201)
    assert.equal(bcrypt.getRounds(persisted.password), 10)
    assert.equal(await bcrypt.compare(password, persisted.password), true)
    assert.equal('password' in res.payload.user, false)
    if (password.startsWith(' ')) {
      assert.equal(await bcrypt.compare(password.trim(), persisted.password), false)
      assert.equal(await bcrypt.compare(password.normalize('NFC'), persisted.password), false)
    }
  }
})

test('historical overlong logins retain raw comparison; hashes cannot disambiguate ignored suffixes', async (t) => {
  const previous = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'isolated-password-policy-fixture-signing-key-only-2026'
  t.after(() => { if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous })
  resetLoginRateLimitForTests()
  t.after(resetLoginRateLimitForTests)
  let hash
  t.mock.method(User, 'findOne', () => ({ select: async () => ({ ...fixture, password: hash }) }))
  t.mock.method(User, 'create', () => { throw new Error('Login must not create users') })
  for (const prefix of ['a'.repeat(72), '虎'.repeat(24), '🐾'.repeat(18)]) {
    hash = await bcrypt.hash(prefix + '-historical-suffix', 4)
    const original = hash
    for (const password of [prefix + '-historical-suffix', prefix + '-different-suffix', prefix]) {
      const res = response()
      await login(request(password), res, (error) => { throw error })
      assert.equal(res.statusCode, 200)
      assert.equal(res.payload.user.id, fixture._id)
      assert.equal(hash === original, true)
    }
    const rejected = response()
    await login(request('z' + prefix.slice(1)), rejected, (error) => { throw error })
    assert.equal(rejected.statusCode, 401)
    assert.equal(rejected.payload.code, 'AUTH_INVALID_CREDENTIALS')
  }
  assert.equal(User.create.mock.callCount(), 0)
  // The ambiguity also applies to a newly set password of exactly 72 bytes.
  hash = await bcrypt.hash('b'.repeat(72), 4)
  assert.equal(await bcrypt.compare('b'.repeat(72) + '-ignored', hash), true)
})

test('all existing password-setting paths use the shared guard; seed entry point is not executed', async () => {
  const seed = await readFile(new URL('../scripts/seedTestData.js', import.meta.url), 'utf8')
  const controller = await readFile(new URL('../controllers/authController.js', import.meta.url), 'utf8')
  const routes = await readFile(new URL('../routes/auth.js', import.meta.url), 'utf8')
  assert.match(seed, /import \{ validateNewPassword \} from '..\/services\/passwordPolicy.js'/)
  assert.match(seed, /if \(validateNewPassword\(password\)\)/)
  assert.match(seed, /const \{ password \} = seedConfiguration\(\)/)
  assert.equal(seed.indexOf('const { password } = seedConfiguration()') < seed.indexOf('await connectDatabase('), true)
  assert.match(controller, /const passwordError = validateNewPassword\(password\)/)
  assert.doesNotMatch(routes, /reset|change.password/i)
  assert.equal(validateNewPassword('short').code, 'PASSWORD_TOO_SHORT')
  assert.equal(validateNewPassword(undefined).code, 'PASSWORD_TOO_SHORT')
})

test('real HTTP auth routes enforce the byte policy and preserve legacy login, using isolated model fixtures', async (t) => {
  const previous = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'isolated-password-policy-fixture-signing-key-only-2026'
  t.after(() => { if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous })
  resetLoginRateLimitForTests()
  t.after(resetLoginRateLimitForTests)
  let account
  t.mock.method(User, 'findOne', () => account ? { select: async () => account } : null)
  t.mock.method(User, 'create', async (value) => { account = { ...fixture, ...value }; return account })
  const app = express()
  app.use(express.json())
  app.use('/api/auth', authRoutes)
  app.use((_error, _req, res, _next) => res.status(500).json({ code: 'UNEXPECTED_FIXTURE_ERROR' }))
  const server = app.listen(0, '127.0.0.1')
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections() }))
  await once(server, 'listening')
  const post = (path, password) => fetch(`http://127.0.0.1:${server.address().port}/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request(password).body) })
  const rejected = await post('register', '虎'.repeat(24) + 'a')
  assert.equal(rejected.status, 400)
  assert.deepEqual((await rejected.json()).params, { maxBytes: 72 })
  assert.equal(User.create.mock.callCount(), 0)
  const accepted = await post('register', '虎'.repeat(24))
  assert.equal(accepted.status, 201)
  assert.equal(await bcrypt.compare('虎'.repeat(24), account.password), true)
  const legacyHash = await bcrypt.hash('🐾'.repeat(18) + '-old-suffix', 4)
  account = { ...account, password: legacyHash }
  const legacy = await post('login', '🐾'.repeat(18) + '-old-suffix')
  assert.equal(legacy.status, 200)
  const body = await legacy.json()
  assert.equal(body.user.id, fixture._id)
  assert.equal('password' in body.user, false)
  assert.equal(account.password === legacyHash, true)
})
