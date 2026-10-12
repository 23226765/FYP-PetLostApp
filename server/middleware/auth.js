import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { requireJwtSecret } from '../config/security.js'
import { logServerError } from './errorHandler.js'

function unavailable(res, error) {
  logServerError('Authentication service unavailable', error)
  return res.status(503).json({
    error: 'Authentication service temporarily unavailable.', code: 'AUTH_SERVICE_UNAVAILABLE',
  })
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Authentication required' })
  let secret, payload
  try { secret = requireJwtSecret() } catch (error) { return unavailable(res, error) }
  try { payload = jwt.verify(token, secret) }
  catch { return res.status(401).json({ error: 'Invalid or expired token' }) }
  try {
    const user = await User.findById(payload.id)
    if (!user) return res.status(401).json({ error: 'User not found' })

    req.user = user
    next()
  } catch (err) {
    return unavailable(res, err)
  }
}

// Invalid/missing credentials may browse as guests. Infrastructure failures
// must not masquerade as guest access or invalid authentication.
export async function optionalAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return next()
  let secret, payload
  try { secret = requireJwtSecret() } catch (error) { return unavailable(res, error) }
  try { payload = jwt.verify(token, secret) } catch { return next() }
  try {
    const user = await User.findById(payload.id)
    if (user) req.user = user
  } catch (error) { return unavailable(res, error) }
  next()
}
