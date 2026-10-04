import { Router } from 'express'
import {
  listModerationReports,
  updateContentVisibility,
  updateModerationReport,
} from '../controllers/moderationController.js'
import { requireAuth } from '../middleware/auth.js'
import { mutationRateLimit } from '../middleware/rateLimit.js'
import { requireShelterAdmin } from '../middleware/role.js'

const router = Router()

router.get('/reports', requireAuth, requireShelterAdmin, listModerationReports)
router.patch('/reports/:id', requireAuth, requireShelterAdmin, mutationRateLimit, updateModerationReport)
router.patch(
  '/content/:targetType/:targetId/visibility',
  requireAuth,
  requireShelterAdmin,
  mutationRateLimit,
  updateContentVisibility,
)

export default router
