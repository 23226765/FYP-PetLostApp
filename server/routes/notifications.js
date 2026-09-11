import { Router } from 'express'
import { listNotifications } from '../controllers/notificationController.js'

const router = Router()

router.get('/', listNotifications)

export default router
