import { Router } from 'express'
import { listHotspots } from '../controllers/analyticsController.js'

const router = Router()

router.get('/hotspots', listHotspots)

export default router
