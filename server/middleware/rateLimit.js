const DEFAULT_MAX_BUCKETS = 50_000

export const RATE_LIMIT_POLICIES = Object.freeze({
  registration: Object.freeze({ windowMs: 60 * 60 * 1000, ipLimit: 5 }),
  mutation: Object.freeze({ windowMs: 15 * 60 * 1000, userLimit: 120, ipLimit: 300 }),
  upload: Object.freeze({ windowMs: 15 * 60 * 1000, userLimit: 20, ipLimit: 60 }),
})

const registrationStore = new Map()
const mutationStore = new Map()
const uploadStore = new Map()

function normalizedIp(req) {
  const address = req.ip || req.socket?.remoteAddress || 'unknown'
  return String(address).trim().toLowerCase() || 'unknown'
}

function normalizedUserId(req) {
  const value = req.user?._id ?? req.user?.id
  return value == null ? '' : String(value).trim()
}

function setRateLimitHeaders(res, entries, now) {
  const limit = Math.min(...entries.map((entry) => entry.limit))
  const remaining = Math.min(...entries.map((entry) => Math.max(0, entry.limit - entry.count)))
  const resetSeconds = Math.max(
    1,
    Math.ceil((Math.max(...entries.map((entry) => entry.resetAt)) - now) / 1000),
  )

  res.set('RateLimit-Limit', String(limit))
  res.set('RateLimit-Remaining', String(remaining))
  res.set('RateLimit-Reset', String(resetSeconds))
}

/**
 * Creates an in-memory, bounded fixed-window limiter. This intentionally has no
 * timers, so test/server shutdown is clean. A shared external store can replace
 * it later if PawRadar is deployed across multiple backend instances.
 */
export function createRateLimiter({
  windowMs,
  limits,
  store = new Map(),
  maxBuckets = DEFAULT_MAX_BUCKETS,
  now = () => Date.now(),
}) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new TypeError('windowMs must be positive')
  if (!Array.isArray(limits) || limits.length === 0) throw new TypeError('limits must not be empty')

  const normalizedLimits = limits.map((policy) => {
    if (!policy?.name || !Number.isInteger(policy.limit) || policy.limit <= 0 || typeof policy.key !== 'function') {
      throw new TypeError('Each rate-limit policy requires a name, positive integer limit, and key function')
    }
    return policy
  })

  let lastPrunedAt = 0

  function pruneExpired(timestamp) {
    const pruneInterval = Math.min(windowMs, 60_000)
    if (store.size < maxBuckets && timestamp - lastPrunedAt < pruneInterval) return

    for (const [key, bucket] of store) {
      if (bucket.resetAt <= timestamp) store.delete(key)
    }
    while (store.size >= maxBuckets) {
      const oldestKey = store.keys().next().value
      if (oldestKey === undefined) break
      store.delete(oldestKey)
    }
    lastPrunedAt = timestamp
  }

  return function rateLimit(req, res, next) {
    const timestamp = now()
    pruneExpired(timestamp)

    const entries = normalizedLimits.map((policy) => {
      const identity = String(policy.key(req) || 'unknown')
      const storeKey = `${policy.name}:${identity}`
      const existing = store.get(storeKey)
      const bucket = !existing || existing.resetAt <= timestamp
        ? { count: 0, resetAt: timestamp + windowMs }
        : existing
      return { ...bucket, limit: policy.limit, storeKey }
    })

    const blocked = entries.some((entry) => entry.count >= entry.limit)
    if (blocked) {
      setRateLimitHeaders(res, entries, timestamp)
      const retryAfter = Math.max(
        1,
        Math.ceil((Math.max(...entries.filter((entry) => entry.count >= entry.limit).map((entry) => entry.resetAt)) - timestamp) / 1000),
      )
      res.set('Retry-After', String(retryAfter))
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
      })
    }

    for (const entry of entries) {
      entry.count += 1
      if (!store.has(entry.storeKey) && store.size >= maxBuckets) {
        const oldestKey = store.keys().next().value
        if (oldestKey !== undefined) store.delete(oldestKey)
      }
      store.set(entry.storeKey, { count: entry.count, resetAt: entry.resetAt })
    }
    setRateLimitHeaders(res, entries, timestamp)
    return next()
  }
}

const registrationLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_POLICIES.registration.windowMs,
  store: registrationStore,
  limits: [
    { name: 'registration-ip', limit: RATE_LIMIT_POLICIES.registration.ipLimit, key: normalizedIp },
  ],
})

const mutationLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_POLICIES.mutation.windowMs,
  store: mutationStore,
  limits: [
    { name: 'mutation-user', limit: RATE_LIMIT_POLICIES.mutation.userLimit, key: normalizedUserId },
    { name: 'mutation-ip', limit: RATE_LIMIT_POLICIES.mutation.ipLimit, key: normalizedIp },
  ],
})

const uploadLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_POLICIES.upload.windowMs,
  store: uploadStore,
  limits: [
    { name: 'upload-user', limit: RATE_LIMIT_POLICIES.upload.userLimit, key: normalizedUserId },
    { name: 'upload-ip', limit: RATE_LIMIT_POLICIES.upload.ipLimit, key: normalizedIp },
  ],
})

export function registrationRateLimit(req, res, next) {
  return registrationLimiter(req, res, next)
}

export function mutationRateLimit(req, res, next) {
  return mutationLimiter(req, res, next)
}

export function uploadRateLimit(req, res, next) {
  return uploadLimiter(req, res, next)
}

export function resetRateLimitsForTests() {
  registrationStore.clear()
  mutationStore.clear()
  uploadStore.clear()
}
