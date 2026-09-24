const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_IP_LIMIT = 10
const LOGIN_EMAIL_LIMIT = 5
const MAX_LOGIN_BUCKETS = 10_000

/** @typedef {{ count: number, resetAt: number }} LoginAttempt */
/** @type {Map<string, LoginAttempt>} */
const loginAttempts = new Map()

export function loginKeys(req, email) {
  const address = req.ip || req.socket?.remoteAddress || 'unknown'
  const keys = [`ip:${address}`]
  if (email) keys.push(`email:${email}`)
  return keys
}

export function pruneLoginAttempts(now) {
  for (const [key, attempt] of loginAttempts) {
    if (attempt.resetAt <= now) loginAttempts.delete(key)
  }

  while (loginAttempts.size > MAX_LOGIN_BUCKETS) {
    const oldestKey = loginAttempts.keys().next().value
    if (typeof oldestKey !== 'string') break
    loginAttempts.delete(oldestKey)
  }
}

export function loginRetryAfter(keys, now) {
  let retryAfter = 0

  for (const key of keys) {
    const attempt = loginAttempts.get(key)
    if (!attempt) continue
    const limit = key.startsWith('ip:') ? LOGIN_IP_LIMIT : LOGIN_EMAIL_LIMIT
    if (attempt.count >= limit) {
      retryAfter = Math.max(retryAfter, Math.ceil((attempt.resetAt - now) / 1000))
    }
  }

  return retryAfter
}

export function recordLoginFailure(keys, now) {
  for (const key of keys) {
    const current = loginAttempts.get(key)
    if (!current || current.resetAt <= now) {
      loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
    } else {
      current.count += 1
    }
  }
}

export function clearLoginFailures(keys) {
  for (const key of keys) loginAttempts.delete(key)
}

export function resetLoginRateLimitForTests() {
  loginAttempts.clear()
}
