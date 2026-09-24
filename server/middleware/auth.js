import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { requireJwtSecret } from '../config/security.js'

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Authentication required' })

    const payload = jwt.verify(token, requireJwtSecret())
    const user = await User.findById(payload.id)
    if (!user) return res.status(401).json({ error: 'User not found' })

    req.user = user
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// Like requireAuth, but never rejects — treats unauthenticated requests as guests.
export async function optionalAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (token) {
      const payload = jwt.verify(token, requireJwtSecret())
      const user = await User.findById(payload.id)
      if (user) req.user = user
    }
  } catch {
    // ignore — proceed as guest
  }
  next()
}
