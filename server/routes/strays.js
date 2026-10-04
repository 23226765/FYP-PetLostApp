import { Router } from 'express'
import {
  createComment, deleteComment, deleteStray, getStray, listComments, listMyStrays,
  listSavedStrays, listStrays, nearbyStrays, reportStray, saveStray, unsaveStray,
  updateComment, updateRescueStatus, updateStray,
} from '../controllers/strayController.js'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import { mutationRateLimit } from '../middleware/rateLimit.js'

const router = Router()
router.get('/', optionalAuth, listStrays)
router.get('/mine', requireAuth, listMyStrays)
router.get('/nearby', optionalAuth, nearbyStrays)
router.get('/saved', requireAuth, listSavedStrays)
router.post('/report', requireAuth, mutationRateLimit, reportStray)
router.get('/:id/comments', optionalAuth, listComments)
router.post('/:id/comments', requireAuth, mutationRateLimit, createComment)
router.patch('/:id/comments/:commentId', requireAuth, mutationRateLimit, updateComment)
router.delete('/:id/comments/:commentId', requireAuth, mutationRateLimit, deleteComment)
router.put('/:id/saved', requireAuth, mutationRateLimit, saveStray)
router.delete('/:id/saved', requireAuth, mutationRateLimit, unsaveStray)
router.get('/:id', optionalAuth, getStray)
router.patch('/:id', requireAuth, mutationRateLimit, updateStray)
router.delete('/:id', requireAuth, mutationRateLimit, deleteStray)
router.patch('/:id/status', requireAuth, mutationRateLimit, updateRescueStatus)
export default router
