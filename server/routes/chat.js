import { Router } from 'express'
import { createMessage, getMessages } from '../controllers/chatController.js'

const router = Router()

router.get('/:petId', getMessages)
router.post('/:petId', createMessage)

export default router
