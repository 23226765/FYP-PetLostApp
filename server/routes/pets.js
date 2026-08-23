import { Router } from 'express'
import {
  listPets,
  getNearbyPets,
  getPet,
  reportPet,
  submitSighting,
  updateStatus,
} from '../controllers/petController.js'

const router = Router()

// Static path segments first so they don't collide with `/:id`.
router.get('/', listPets)
router.get('/nearby', getNearbyPets)
router.post('/report', reportPet)

router.get('/:id', getPet)
router.post('/:id/sighting', submitSighting)
router.patch('/:id/status', updateStatus)

export default router