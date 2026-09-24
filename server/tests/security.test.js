import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MIN_JWT_SECRET_LENGTH,
  requireJwtSecret,
  securityConfigurationMessage,
} from '../config/security.js'
import {
  clearLoginFailures,
  loginKeys,
  loginRetryAfter,
  recordLoginFailure,
  resetLoginRateLimitForTests,
} from '../services/loginRateLimit.js'

test('JWT configuration rejects missing, short, and known placeholder secrets', () => {
  const rejected = [
    ['', 'JWT_SECRET_MISSING'],
    ['too-short', 'JWT_SECRET_TOO_SHORT'],
    ['pawradar_dev_secret', 'JWT_SECRET_PLACEHOLDER'],
    ['pawradar_dev_secret_change_me', 'JWT_SECRET_PLACEHOLDER'],
    ['x'.repeat(MIN_JWT_SECRET_LENGTH), 'JWT_SECRET_WEAK'],
  ]

  for (const [value, code] of rejected) {
    assert.throws(() => requireJwtSecret(value), (error) => error.code === code)
  }
  const validSecret = 'M3adow!River-Quartz_2026-Private-Key'
  assert.equal(requireJwtSecret(validSecret), validSecret)
})

test('JWT configuration errors never include the submitted secret', () => {
  const secret = 'short-private-value'
  let caught
  try {
    requireJwtSecret(secret)
  } catch (error) {
    caught = error
  }
  assert.ok(caught)
  assert.equal(securityConfigurationMessage(caught).includes(secret), false)
})

test('successful login reset clears both email and IP failure counters', () => {
  resetLoginRateLimitForTests()
  const now = Date.now()
  const keys = loginKeys({ ip: '203.0.113.10' }, 'person@example.test')

  for (let attempt = 0; attempt < 10; attempt += 1) recordLoginFailure(keys, now)
  assert.ok(loginRetryAfter(keys, now) > 0)

  clearLoginFailures(keys)
  assert.equal(loginRetryAfter(keys, now), 0)
  resetLoginRateLimitForTests()
})

test('successful login uses the combined email and IP reset path', () => {
  const controller = readFileSync(new URL('../controllers/authController.js', import.meta.url), 'utf8')
  assert.match(controller, /const keys = loginKeys\(req, email\)/)
  assert.match(controller, /clearLoginFailures\(keys\)/)
  assert.doesNotMatch(controller, /loginAttempts\.delete\(`email:/)
})
