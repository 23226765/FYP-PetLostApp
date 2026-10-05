import { Router } from 'express'
import { requireAuth, optionalAuth } from '../middleware/auth.js'
import { uploadRateLimit, mutationRateLimit } from '../middleware/rateLimit.js'
import { parseManagedImage, requireManagedUploads, imageUploadSlot } from '../middleware/imageUpload.js'
import { createManagedUploadController } from '../controllers/managedUploadController.js'

export function createUploadsRouter(dependencies) {
  const { uploadManagedImage, previewManagedImage, deliverManagedImage, discardManagedImage, replaceContentImages } = createManagedUploadController(dependencies)
  const router = Router()
  // Keep the old path explicit, but never create another local/Base64 upload.
  router.post('/image', requireAuth, (_req, res) => res.status(410).json({ code: 'IMAGE_IDS_REQUIRED', error: 'Use authenticated multipart managed uploads.' }))
  router.post('/managed', requireAuth, requireManagedUploads, uploadRateLimit, imageUploadSlot, parseManagedImage, uploadManagedImage)
  router.get('/managed/:id/preview', requireAuth, requireManagedUploads, previewManagedImage)
  router.get('/managed/:id/content', optionalAuth, deliverManagedImage)
  router.delete('/managed/:id', requireAuth, mutationRateLimit, discardManagedImage)
  router.patch('/managed/content/:type/:id', requireAuth, mutationRateLimit, replaceContentImages)
  return router
}
export default createUploadsRouter()
