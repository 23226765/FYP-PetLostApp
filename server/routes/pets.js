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

const router = Router()

// Static path segments first so they don't collide with `/:id`.
router.get('/', listPets)
router.get('/mine', requireAuth, listMyPets)
router.get('/nearby', getNearbyPets)
router.post('/smart-match', smartMatch)
router.post('/report', optionalAuth, reportPet)
router.get('/sightings/mine', requireAuth, listMySightings)

router.get('/:id/sightings', optionalAuth, listSightings)
router.post('/:id/sightings/:sightingId/confirm', requireAuth, confirmSighting)
router.get('/:id', getPet)
router.post('/:id/sighting', optionalAuth, submitSighting)
router.patch('/:id/status', requireAuth, updateStatus)

export default router
