import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'

const JWT_SECRET = process.env.JWT_SECRET || 'pawradar_dev_secret'

function signToken(user) {
  return jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' })
}

function serializeUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatar: user.avatar,
    role: user.role,
  }
}

// POST /api/auth/register
export async function register(req, res, next) {
  try {
    const { name, email, password, phone } = req.body
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required.' })
    }

    const existing = await User.findOne({ email: email.toLowerCase() })
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
export async function login(req, res, next) {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' })
    }

    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' })

    const ok = await bcrypt.compare(password, user.password)
    if (!ok) return res.status(401).json({ error: 'Invalid email or password.' })

    res.json({ token: signToken(user), user: serializeUser(user) })
  } catch (err) {
    next(err)
  }
}

// GET /api/auth/me
export async function me(req, res) {
  res.json({ user: serializeUser(req.user) })
}
