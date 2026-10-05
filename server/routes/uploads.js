import { Router } from 'express'
import { uploadImage } from '../controllers/uploadController.js'
import { requireAuth } from '../middleware/auth.js'
import { uploadRateLimit } from '../middleware/rateLimit.js'
import { parseManagedImage, requireManagedUploads, imageUploadSlot } from '../middleware/imageUpload.js'
import { createManagedUploadController } from '../controllers/managedUploadController.js'

export function createUploadsRouter(dependencies) {
  const { uploadManagedImage, previewManagedImage } = createManagedUploadController(dependencies)
  const router = Router()
  router.post('/image', requireAuth, uploadRateLimit, uploadImage)
  // Phase 1 is opt-in. Existing clients retain /image until Phase 2 adopts IDs.
  router.post('/managed', requireAuth, requireManagedUploads, uploadRateLimit, imageUploadSlot, parseManagedImage, uploadManagedImage)
  router.get('/managed/:id/preview', requireAuth, requireManagedUploads, previewManagedImage)
  return router
}
export default createUploadsRouter()
