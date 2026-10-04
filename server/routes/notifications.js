import { Router } from 'express'
import {
  listNotifications,
  markAllRead,
  markRead,
  updatePreferences,
} from '../controllers/notificationController.js'
import { requireAuth } from '../middleware/auth.js'
import { mutationRateLimit } from '../middleware/rateLimit.js'

const router = Router()

router.use(requireAuth)
router.get('/', listNotifications)
router.put('/preferences', mutationRateLimit, updatePreferences)
router.patch('/read-all', mutationRateLimit, markAllRead)
router.patch('/:id/read', mutationRateLimit, markRead)

export default router
