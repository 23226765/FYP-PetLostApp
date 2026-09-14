import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'

const JWT_SECRET = process.env.JWT_SECRET || 'pawradar_dev_secret'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_EMAIL_LENGTH = 254
const MIN_PASSWORD_LENGTH = 6
const MAX_NAME_LENGTH = 100
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_IP_LIMIT = 10
const LOGIN_EMAIL_LIMIT = 5
const MAX_LOGIN_BUCKETS = 10_000

/** @typedef {{ count: number, resetAt: number }} LoginAttempt */
/** @type {Map<string, LoginAttempt>} */
const loginAttempts = new Map()

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

/**
 * @param {import('express').Request} req
 * @param {string} email
 * @returns {string[]}
 */
function loginKeys(req, email) {
  const address = req.ip || req.socket?.remoteAddress || 'unknown'
  const keys = [`ip:${address}`]
  if (email) keys.push(`email:${email}`)
  return keys
}

/**
 * Remove expired counters and cap attacker-controlled email buckets.
 * @param {number} now
 */
function pruneLoginAttempts(now) {
  for (const [key, attempt] of loginAttempts) {
    if (attempt.resetAt <= now) loginAttempts.delete(key)
  }

  while (loginAttempts.size > MAX_LOGIN_BUCKETS) {
    const oldestKey = loginAttempts.keys().next().value
    if (typeof oldestKey !== 'string') break
    loginAttempts.delete(oldestKey)
  }
}

/**
 * @param {string[]} keys
 * @param {number} now
 * @returns {number} seconds until another attempt is allowed, or zero
 */
function loginRetryAfter(keys, now) {
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

/**
 * @param {string[]} keys
 * @param {number} now
 */
function recordLoginFailure(keys, now) {
  for (const key of keys) {
    const current = loginAttempts.get(key)
    if (!current || current.resetAt <= now) {
      loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
    } else {
      current.count += 1
    }
  }
}

/**
 * @param {unknown} body
 * @returns {{ value?: { name: string, email: string, password: string, phone: string }, error?: string }}
 */
function validateRegistration(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'Name, email and password are required.' }
  }

  const { name, email, password, phone } = body
  const normalizedName = typeof name === 'string' ? name.trim() : ''
  const normalizedEmail = normalizeEmail(email)

  if (!normalizedName || !normalizedEmail || typeof password !== 'string') {
    return { error: 'Name, email and password are required.' }
  }
  if (normalizedName.length > MAX_NAME_LENGTH) {
    return { error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` }
  }
  if (normalizedEmail.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(normalizedEmail)) {
    return { error: 'Enter a valid email address.' }
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  }
  if (phone !== undefined && phone !== null && typeof phone !== 'string') {
    return { error: 'Phone must be a string.' }
  }

  return {
    value: {
      name: normalizedName,
      email: normalizedEmail,
      password,
      phone: typeof phone === 'string' ? phone.trim() : '',
    },
  }
}

/** @param {{ _id: unknown }} user */
function signToken(user) {
  return jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' })
}

/** @param {{ _id: unknown, name?: string, email?: string, phone?: string, avatar?: string, role?: string, alertsEnabled?: boolean, alertRadiusKm?: number }} user */
function serializeUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatar: user.avatar,
    role: user.role,
    alertsEnabled: user.alertsEnabled !== false,
    alertRadiusKm: user.alertRadiusKm || 3,
  }
}

// POST /api/auth/register
/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function register(req, res, next) {
  try {
    const validation = validateRegistration(req.body)
    if (!validation.value) return res.status(400).json({ error: validation.error })
    const { name, email, password, phone } = validation.value

    const existing = await User.findOne({ email })
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' })
    }

    const hashed = await bcrypt.hash(password, 10)
    const user = await User.create({
      name,
      email,
      password: hashed,
      phone: phone || '',
    })

    res.status(201).json({ token: signToken(user), user: serializeUser(user) })
  } catch (err) {
    next(err)
  }
}

// POST /api/auth/login
/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function login(req, res, next) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const email = normalizeEmail(body.email)
    const password = typeof body.password === 'string' ? body.password : ''
    const now = Date.now()
    pruneLoginAttempts(now)
    const keys = loginKeys(req, email)
    const retryAfter = loginRetryAfter(keys, now)

    if (retryAfter > 0) {
      res.set('Retry-After', String(retryAfter))
      return res.status(429).json({ error: 'Too many login attempts. Please try again later.' })
    }

    if (!email || !password) {
      recordLoginFailure([keys[0]], now)
      return res.status(400).json({ error: 'Email and password are required.' })
    }
    if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
      recordLoginFailure(keys, now)
      return res.status(400).json({ error: 'Enter a valid email address.' })
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      recordLoginFailure(keys, now)
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` })
    }

    const user = await User.findOne({ email })
    if (!user) {
      recordLoginFailure(keys, now)
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    const ok = await bcrypt.compare(password, user.password)
    if (!ok) {
      recordLoginFailure(keys, now)
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    loginAttempts.delete(`email:${email}`)

    res.json({ token: signToken(user), user: serializeUser(user) })
  } catch (err) {
    next(err)
  }
}

// GET /api/auth/me
/**
 * @param {import('express').Request & { user: Parameters<typeof serializeUser>[0] }} req
 * @param {import('express').Response} res
 */
export async function me(req, res) {
  res.json({ user: serializeUser(req.user) })
}

// PATCH /api/auth/me
export async function updateMe(req, res, next) {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    const email = normalizeEmail(req.body?.email)
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : ''

    if (!name || name.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ error: `Name is required and must be ${MAX_NAME_LENGTH} characters or fewer.` })
    }
    if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' })
    }
    if (phone.length > 30) {
      return res.status(400).json({ error: 'Phone must be 30 characters or fewer.' })
    }

    const existing = await User.findOne({ email, _id: { $ne: req.user._id } }).select('_id')
    if (existing) return res.status(409).json({ error: 'That email address is already in use.' })

    req.user.name = name
    req.user.email = email
    req.user.phone = phone
    await req.user.save()
    res.json({ user: serializeUser(req.user) })
  } catch (error) {
    next(error)
  }
}
