import { Router } from 'express'
import {
  createComment, deleteComment, deleteStray, getStray, listComments, listMyStrays,
  listSavedStrays, listStrays, nearbyStrays, reportStray, saveStray, unsaveStray,
  updateComment, updateRescueStatus, updateStray,
} from '../controllers/strayController.js'
import { optionalAuth, requireAuth } from '../middleware/auth.js'

const router = Router()
router.get('/', optionalAuth, listStrays)
router.get('/mine', requireAuth, listMyStrays)
router.get('/nearby', optionalAuth, nearbyStrays)
router.get('/saved', requireAuth, listSavedStrays)
router.post('/report', requireAuth, reportStray)
router.get('/:id/comments', optionalAuth, listComments)
router.post('/:id/comments', requireAuth, createComment)
router.patch('/:id/comments/:commentId', requireAuth, updateComment)
router.delete('/:id/comments/:commentId', requireAuth, deleteComment)
router.put('/:id/saved', requireAuth, saveStray)
router.delete('/:id/saved', requireAuth, unsaveStray)
router.get('/:id', optionalAuth, getStray)
router.patch('/:id', requireAuth, updateStray)
router.delete('/:id', requireAuth, deleteStray)
router.patch('/:id/status', requireAuth, updateRescueStatus)
export default router
