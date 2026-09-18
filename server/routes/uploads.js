import { Router } from 'express'
import { uploadImage } from '../controllers/uploadController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.post('/image', requireAuth, uploadImage)
export default router
