import { Router } from 'express'
import {
  listNotifications,
  markAllRead,
  markRead,
  updatePreferences,
} from '../controllers/notificationController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.use(requireAuth)
router.get('/', listNotifications)
router.put('/preferences', updatePreferences)
router.patch('/read-all', markAllRead)
router.patch('/:id/read', markRead)

export default router
