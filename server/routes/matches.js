import { Router } from 'express'
import { smartMatch } from '../controllers/petController.js'

const router = Router()

// Public so a finder can compare an observation without creating an account.
router.post('/candidates', smartMatch)

export default router
