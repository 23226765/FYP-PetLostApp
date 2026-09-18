import { Router } from 'express'
import {
  getPrivacy,
  login,
  me,
  register,
  updateMe,
  updatePrivacy,
} from '../controllers/authController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.post('/register', register)
router.post('/login', login)
router.get('/me', requireAuth, me)
router.patch('/me', requireAuth, updateMe)
router.get('/me/privacy', requireAuth, getPrivacy)
router.patch('/me/privacy', requireAuth, updatePrivacy)

export default router
