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

const router = Router()

router.post('/register', register)
router.post('/login', login)
router.get('/me', requireAuth, me)
router.patch('/me', requireAuth, updateMe)
router.get('/me/privacy', requireAuth, getPrivacy)
router.patch('/me/privacy', requireAuth, updatePrivacy)
router.get('/me/preferences', requireAuth, getPreferences)
router.patch('/me/preferences', requireAuth, updatePreferences)

export default router
