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

router.get('/', optionalAuth, listStrays)
router.get('/mine', requireAuth, listMyStrays)
router.get('/nearby', optionalAuth, nearbyStrays)
router.post('/report', optionalAuth, reportStray)
router.get('/:id', optionalAuth, getStray)
router.patch('/:id/status', requireAuth, updateRescueStatus)

export default router
