import { Router } from 'express'
import {
  createMessage,
  getMessages,
  listConversations,
  markMessagesRead,
} from '../controllers/chatController.js'
import { requireAuth } from '../middleware/auth.js'
import { mutationRateLimit } from '../middleware/rateLimit.js'

const router = Router()

router.get('/inbox', requireAuth, listConversations)
router.get('/:petId', requireAuth, getMessages)
router.patch('/:petId/read', requireAuth, mutationRateLimit, markMessagesRead)
router.post('/:petId', requireAuth, mutationRateLimit, createMessage)

export default router
