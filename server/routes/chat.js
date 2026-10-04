import { Router } from 'express'
import {
  createMessage,
  getMessages,
  listConversations,
} from '../controllers/chatController.js'
import { requireAuth } from '../middleware/auth.js'
import { mutationRateLimit } from '../middleware/rateLimit.js'

const router = Router()

router.get('/inbox', requireAuth, listConversations)
router.get('/:petId', requireAuth, getMessages)
router.post('/:petId', requireAuth, mutationRateLimit, createMessage)

export default router
