import { createModerationEvidenceResolver } from '../services/moderationEvidence.js'
import { streamManagedImage } from './managedUploadController.js'
import { imageErrorResponse } from '../services/imageErrors.js'
import { createImageStorage } from '../services/storage/index.js'

export function createModerationEvidenceController({ resolve = createModerationEvidenceResolver(), storageFactory = createImageStorage } = {}) {
  return async (req, res, next) => {
    try {
      const evidence = await resolve(req.params.id, req.params.index, req.user)
      if (evidence.asset) await streamManagedImage(evidence.asset, res, storageFactory)
      else res.set('Content-Type', 'image/webp').set('X-Content-Type-Options', 'nosniff').end(evidence.buffer)
    } catch (error) {
      if (!res.headersSent && !res.destroyed) imageErrorResponse(error, res, next)
      else if (!res.destroyed) res.destroy()
    }
  }
}
