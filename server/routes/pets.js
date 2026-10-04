import { Router } from 'express'
import {
  listPets,
  listMyPets,
  listMySightings,
  getNearbyPets,
  smartMatch,
  getPet,
  listSightings,
  confirmSighting,
  reportPet,
  submitSighting,
  updateStatus,
} from '../controllers/petController.js'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import { mutationRateLimit } from '../middleware/rateLimit.js'

const router = Router()

// Static path segments first so they don't collide with `/:id`.
router.get('/', optionalAuth, listPets)
router.get('/mine', requireAuth, listMyPets)
router.get('/nearby', optionalAuth, getNearbyPets)
router.post('/smart-match', optionalAuth, smartMatch)
router.post('/report', requireAuth, mutationRateLimit, reportPet)
router.get('/sightings/mine', requireAuth, listMySightings)

router.get('/:id/sightings', optionalAuth, listSightings)
router.post('/:id/sightings/:sightingId/confirm', requireAuth, mutationRateLimit, confirmSighting)
router.get('/:id', optionalAuth, getPet)
router.post('/:id/sighting', requireAuth, mutationRateLimit, submitSighting)
router.patch('/:id/status', requireAuth, mutationRateLimit, updateStatus)

export default router
