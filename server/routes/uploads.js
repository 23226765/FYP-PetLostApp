import { Router } from 'express'
import { uploadImage } from '../controllers/uploadController.js'
import { requireAuth } from '../middleware/auth.js'
import { uploadRateLimit } from '../middleware/rateLimit.js'

const router = Router()
router.post('/image', requireAuth, uploadRateLimit, uploadImage)
export default router
