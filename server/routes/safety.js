import { Router } from 'express'
import {
  blockUser,
  createContentReport,
  listBlockedUsers,
  unblockUser,
} from '../controllers/safetyController.js'
import { requireAuth } from '../middleware/auth.js'
import { mutationRateLimit } from '../middleware/rateLimit.js'

const router = Router()

router.post('/reports', requireAuth, mutationRateLimit, createContentReport)
router.get('/blocks', requireAuth, listBlockedUsers)
router.put('/blocks/:userId', requireAuth, mutationRateLimit, blockUser)
router.delete('/blocks/:userId', requireAuth, mutationRateLimit, unblockUser)

export default router
