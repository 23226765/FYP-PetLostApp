import { Router } from 'express'
import {
  getPrivacy,
  getPreferences,
  login,
  me,
  register,
  updateMe,
  updatePrivacy,
  updatePreferences,
} from '../controllers/authController.js'
import { requireAuth } from '../middleware/auth.js'
import { mutationRateLimit, registrationRateLimit } from '../middleware/rateLimit.js'

const router = Router()

router.post('/register', registrationRateLimit, register)
router.post('/login', login)
router.get('/me', requireAuth, me)
router.patch('/me', requireAuth, mutationRateLimit, updateMe)
router.get('/me/privacy', requireAuth, getPrivacy)
router.patch('/me/privacy', requireAuth, mutationRateLimit, updatePrivacy)
router.get('/me/preferences', requireAuth, getPreferences)
router.patch('/me/preferences', requireAuth, mutationRateLimit, updatePreferences)

export default router
