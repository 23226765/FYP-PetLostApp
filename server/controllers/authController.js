import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { commitContentImages, rejectImageStrings } from '../services/mediaAttachments.js'
import {
  CONTACT_VISIBILITIES,
  contactVisibilityFor,
} from '../services/contactPrivacy.js'
import {
  preferencesFor,
  validatePreferenceUpdate,
} from '../services/userPreferences.js'
import { requireJwtSecret } from '../config/security.js'
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '../services/passwordPolicy.js'
import {
  clearLoginFailures,
  loginKeys,
  loginRetryAfter,
  pruneLoginAttempts,
  recordLoginFailure,
} from '../services/loginRateLimit.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_EMAIL_LENGTH = 254
const MAX_NAME_LENGTH = 100
const MAX_REAL_NAME_LENGTH = 100

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeRealName(value) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
    : ''
}


/**
 * @param {unknown} body
 * @returns {{ value?: { name: string, email: string, password: string, phone: string }, error?: string, code?: string, field?: string, params?: object }}
 */
function validateRegistration(body) {
  if (!body || typeof body !== 'object') {
    return { error: 'Name, email and password are required.', code: 'INVALID_REQUEST_DATA' }
  }

  const { name, email, password, phone } = body
  const normalizedName = typeof name === 'string' ? name.trim() : ''
  const normalizedEmail = normalizeEmail(email)

  if (!normalizedName || !normalizedEmail || typeof password !== 'string') {
    return { error: 'Name, email and password are required.', code: 'INVALID_REQUEST_DATA' }
  }
  if (normalizedName.length > MAX_NAME_LENGTH) {
    return { error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.`, code: 'FIELD_TOO_LONG', field: 'name', params: { max: MAX_NAME_LENGTH } }
  }
  if (normalizedEmail.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(normalizedEmail)) {
    return { error: 'Enter a valid email address.', code: 'EMAIL_INVALID', field: 'email' }
  }
  const passwordError = validateNewPassword(password)
  if (passwordError) return passwordError
  if (phone !== undefined && phone !== null && typeof phone !== 'string') {
    return { error: 'Phone must be a string.', code: 'FIELD_INVALID', field: 'phone' }
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
  return jwt.sign({ id: user._id }, requireJwtSecret(), { expiresIn: '7d' })
}

/** @param {{ _id: unknown, name?: string, realName?: string, email?: string, phone?: string, avatar?: string, role?: string, alertsEnabled?: boolean, alertRadiusKm?: number, privacy?: { contactVisibility?: string }, preferences?: { language?: string, theme?: string } }} user */
function serializeUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    realName: user.realName || '',
    email: user.email,
    phone: user.phone,
    avatar: user.avatar,
    role: user.role,
    alertsEnabled: user.alertsEnabled !== false,
    alertRadiusKm: user.alertRadiusKm || 3,
    privacy: { contactVisibility: contactVisibilityFor(user) },
    preferences: preferencesFor(user),
  }
}

// GET /api/auth/me/preferences
export async function getPreferences(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select('preferences')
    if (!user) {
      return res.status(404).json({ error: 'User not found.', code: 'USER_NOT_FOUND' })
    }
    res.json({ preferences: preferencesFor(user) })
  } catch (error) {
    next(error)
  }
}

// PATCH /api/auth/me/preferences
export async function updatePreferences(req, res, next) {
  try {
    const validation = validatePreferenceUpdate(req.body)
    if (!validation.value) {
      return res.status(400).json({
        error: validation.error,
        code: validation.code,
        ...(validation.field ? { field: validation.field } : {}),
        ...(validation.fields ? { fields: validation.fields } : {}),
      })
    }

    const current = preferencesFor(req.user)
    req.user.preferences = { ...current, ...validation.value }
    await req.user.save()
    res.json({ success: true, preferences: preferencesFor(req.user) })
  } catch (error) {
    next(error)
  }
}

// GET /api/auth/me/privacy
export async function getPrivacy(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select('privacy.contactVisibility')
    if (!user) return res.status(404).json({ error: 'User not found.' })
    res.json({ privacy: { contactVisibility: contactVisibilityFor(user) } })
  } catch (error) {
    next(error)
  }
}

// PATCH /api/auth/me/privacy
export async function updatePrivacy(req, res, next) {
  try {
    const body =
      req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : null
    if (!body) return res.status(400).json({ error: 'Invalid or missing request body.' })

    const fields = Object.keys(body)
    if (fields.length !== 1 || fields[0] !== 'contactVisibility') {
      return res.status(400).json({
        error: 'Only `contactVisibility` may be updated through this endpoint.',
      })
    }
    if (!CONTACT_VISIBILITIES.includes(body.contactVisibility)) {
      return res.status(400).json({
        error: '`contactVisibility` must be private or authenticated.',
      })
    }

    req.user.privacy = { contactVisibility: body.contactVisibility }
    await req.user.save()
    res.json({
      success: true,
      privacy: { contactVisibility: contactVisibilityFor(req.user) },
    })
  } catch (error) {
    next(error)
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
    rejectImageStrings(req.body)
    const validation = validateRegistration(req.body)
    if (!validation.value) return res.status(400).json({ error: validation.error, code: validation.code, field: validation.field, params: validation.params })
    const { name, email, password, phone } = validation.value

    const existing = await User.findOne({ email })
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.', code: 'EMAIL_IN_USE' })
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
      return res.status(429).json({ error: 'Too many login attempts. Please try again later.', code: 'RATE_LIMITED' })
    }

    if (!email || !password) {
      recordLoginFailure([keys[0]], now)
      return res.status(400).json({ error: 'Email and password are required.', code: 'INVALID_REQUEST_DATA' })
    }
    if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
      recordLoginFailure(keys, now)
      return res.status(400).json({ error: 'Enter a valid email address.', code: 'EMAIL_INVALID', field: 'email' })
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      recordLoginFailure(keys, now)
      return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, code: 'PASSWORD_TOO_SHORT', field: 'password', params: { min: MIN_PASSWORD_LENGTH } })
    }

    const user = await User.findOne({ email }).select('+password +realName')
    if (!user) {
      recordLoginFailure(keys, now)
      return res.status(401).json({ error: 'Invalid email or password.', code: 'AUTH_INVALID_CREDENTIALS' })
    }

    // Do not apply the new-password byte maximum here: hashes cannot identify
    // historical overlong inputs. Preserve raw comparison and existing accounts.
    const ok = await bcrypt.compare(password, user.password)
    if (!ok) {
      recordLoginFailure(keys, now)
      return res.status(401).json({ error: 'Invalid email or password.', code: 'AUTH_INVALID_CREDENTIALS' })
    }

    clearLoginFailures(keys)

    res.json({ token: signToken(user), user: serializeUser(user) })
  } catch (err) {
    next(err)
  }
}

// GET /api/auth/me
/**
 * @param {import('express').Request & { user: Parameters<typeof serializeUser>[0] }} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function me(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select('+realName')
    if (!user) return res.status(404).json({ error: 'User not found.' })
    res.json({ user: serializeUser(user) })
  } catch (error) {
    next(error)
  }
}

// PATCH /api/auth/me
export async function updateMe(req, res, next) {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}
    rejectImageStrings(body)
    const hasName =
      Object.prototype.hasOwnProperty.call(body, 'name') ||
      Object.prototype.hasOwnProperty.call(body, 'displayName')
    const hasEmail = Object.prototype.hasOwnProperty.call(body, 'email')
    const hasPhone = Object.prototype.hasOwnProperty.call(body, 'phone')
    const hasRealName = Object.prototype.hasOwnProperty.call(body, 'realName')
    const hasAvatar = Object.prototype.hasOwnProperty.call(body, 'avatarImageId')
    const submittedName = typeof body.name === 'string' ? body.name.trim() : ''
    const submittedDisplayName =
      typeof body.displayName === 'string' ? body.displayName.trim() : ''
    const resolvedName = submittedName || submittedDisplayName
    const email = normalizeEmail(body.email)
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    const realName = normalizeRealName(body.realName)

    if (!hasName && !hasEmail && !hasPhone && !hasRealName && !hasAvatar) {
      return res.status(400).json({ error: 'Provide at least one profile field to update.', code: 'INVALID_REQUEST_DATA' })
    }
    if (hasName && (!resolvedName || resolvedName.length > MAX_NAME_LENGTH)) {
      return res.status(400).json({ error: `Name is required and must be ${MAX_NAME_LENGTH} characters or fewer.`, code: resolvedName ? 'FIELD_TOO_LONG' : 'FIELD_REQUIRED', field: 'name', params: { max: MAX_NAME_LENGTH } })
    }
    if (hasEmail && (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email))) {
      return res.status(400).json({ error: 'Enter a valid email address.', code: 'EMAIL_INVALID', field: 'email' })
    }
    if (hasPhone && typeof body.phone !== 'string') {
      return res.status(400).json({ error: 'Phone must be a string.', code: 'FIELD_INVALID', field: 'phone' })
    }
    if (hasPhone && phone.length > 30) {
      return res.status(400).json({ error: 'Phone must be 30 characters or fewer.', code: 'FIELD_TOO_LONG', field: 'phone', params: { max: 30 } })
    }
    if (hasRealName && typeof body.realName !== 'string') {
      return res.status(400).json({ error: 'Real name must be a string.', code: 'FIELD_INVALID', field: 'realName' })
    }
    if (realName.length > MAX_REAL_NAME_LENGTH) {
      return res.status(400).json({ error: `Real name must be ${MAX_REAL_NAME_LENGTH} characters or fewer.`, code: 'FIELD_TOO_LONG', field: 'realName', params: { max: MAX_REAL_NAME_LENGTH } })
    }

    if (hasEmail) {
      const existing = await User.findOne({ email, _id: { $ne: req.user._id } }).select('_id')
      if (existing) return res.status(409).json({ error: 'That email address is already in use.', code: 'EMAIL_IN_USE' })
    }

    const values = {
      ...(hasName ? { name: resolvedName } : {}), ...(hasEmail ? { email } : {}),
      ...(hasPhone ? { phone } : {}), ...(hasRealName ? { realName } : {}),
    }
    if (hasAvatar) {
      await commitContentImages({ Model: User, type: 'user', purpose: 'avatar', userId: req.user._id,
        existingId: req.user._id, values, imageIds: body.avatarImageId === null ? [] : [body.avatarImageId] })
    } else {
      Object.assign(req.user, values)
      await req.user.save()
    }
    const updatedUser = await User.findById(req.user._id).select('+realName')
    if (!updatedUser) return res.status(404).json({ error: 'User not found.' })
    res.json({ success: true, user: serializeUser(updatedUser) })
  } catch (error) {
    next(error)
  }
}
