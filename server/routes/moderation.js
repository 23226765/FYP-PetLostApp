import { Router } from 'express'
import {
  listModerationReports,
  updateContentVisibility,
  updateModerationReport,
} from '../controllers/moderationController.js'
import { requireAuth } from '../middleware/auth.js'
import { mutationRateLimit } from '../middleware/rateLimit.js'
import { requireShelterAdmin } from '../middleware/role.js'
import { createModerationEvidenceController } from '../controllers/moderationEvidenceController.js'

export function createModerationRouter({ evidenceController = createModerationEvidenceController() } = {}) {
const router = Router()

router.get('/reports/:id/images/:index', (req, res, next) => {
  res.set('Cache-Control', 'private, no-store, max-age=0').set('Pragma', 'no-cache').set('Expires', '0')
  res.vary('Authorization')
  next()
}, requireAuth, requireShelterAdmin, evidenceController)

router.get('/reports', requireAuth, requireShelterAdmin, listModerationReports)
router.patch('/reports/:id', requireAuth, requireShelterAdmin, mutationRateLimit, updateModerationReport)
router.patch(
  '/content/:targetType/:targetId/visibility',
  requireAuth,
  requireShelterAdmin,
  mutationRateLimit,
  updateContentVisibility,
)

return router
}

export default createModerationRouter()
