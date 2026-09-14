import { Router } from 'express'
import {
  getStray,
  listMyStrays,
  listStrays,
  nearbyStrays,
  reportStray,
  updateRescueStatus,
} from '../controllers/strayController.js'
import { optionalAuth, requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/', listStrays)
router.get('/mine', requireAuth, listMyStrays)
router.get('/nearby', nearbyStrays)
router.post('/report', optionalAuth, reportStray)
router.get('/:id', getStray)
router.patch('/:id/status', requireAuth, updateRescueStatus)

export default router
