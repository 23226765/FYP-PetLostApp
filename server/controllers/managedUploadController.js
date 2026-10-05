import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createImageStorage } from '../services/storage/index.js'
import { createImageLifecycle } from '../services/imageLifecycle.js'
import { imageError, imageErrorResponse } from '../services/imageErrors.js'

export function createManagedUploadController({ storageFactory = createImageStorage, lifecycleFactory = createImageLifecycle } = {}) {
  return {
    async uploadManagedImage(req, res, next) {
      req.managedImageProcessing = true
      try {
        if (
          !req.file?.buffer || !req.body || Object.keys(req.body).length !== 2
          || Object.keys(req.body).some((key) => !['purpose', 'idempotencyKey'].includes(key))
        ) throw imageError('IMAGE_REQUEST_INVALID')
        const storage = storageFactory()
        const lifecycle = lifecycleFactory({ storage })
        const result = await lifecycle.upload({
          userId: req.user._id, purpose: req.body.purpose,
          idempotencyKey: req.body.idempotencyKey, buffer: req.file.buffer,
        })
        res.set('Cache-Control', 'no-store')
        if (!res.destroyed) res.status(result.duplicate ? 200 : 201).json(result)
      } catch (error) {
        if (!res.destroyed) imageErrorResponse(error, res, next)
      } finally {
        req.releaseImageUploadSlot?.()
        if (req.file) req.file.buffer = undefined
      }
    },
    async previewManagedImage(req, res, next) {
      try {
        const storage = storageFactory()
        const asset = await lifecycleFactory({ storage }).pendingForUser(req.params.id, req.user._id)
        const body = await storage.openReadStream(asset)
        let bytes = 0
        const bounded = new Transform({ transform(chunk, _encoding, callback) {
          bytes += chunk.length
          callback(bytes > asset.bytes ? imageError('IMAGE_STORAGE_UNAVAILABLE') : null, chunk)
        } })
        res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff' })
        await pipeline(Readable.fromWeb(body), bounded, res)
      } catch (error) {
        if (!res.headersSent && !res.destroyed) imageErrorResponse(error, res, next)
        else if (!res.destroyed) res.destroy()
      }
    },
  }
}

export const { uploadManagedImage, previewManagedImage } = createManagedUploadController()
