import { Router } from 'express'
import { smartMatch } from '../controllers/petController.js'
import { optionalAuth } from '../middleware/auth.js'

const router = Router()

// Public so a finder can compare an observation without creating an account.
router.post('/candidates', optionalAuth, smartMatch)

export default router
