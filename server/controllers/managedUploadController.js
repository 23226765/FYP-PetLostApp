import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createImageStorage } from '../services/storage/index.js'
import { createImageLifecycle } from '../services/imageLifecycle.js'
import { imageError, imageErrorResponse } from '../services/imageErrors.js'
import { attachedImageForViewer, authorizeMediaDestination, mediaModels } from '../services/mediaAccess.js'
import { commitContentImages } from '../services/mediaAttachments.js'
import { sameId } from '../services/locationPrivacy.js'

export async function streamManagedImage(asset, res, storageFactory = createImageStorage) {
    const body = await storageFactory().openReadStream(asset)
    let bytes = 0
    const bounded = new Transform({ transform(chunk, _encoding, callback) {
      bytes += chunk.length
      callback(bytes > asset.bytes ? imageError('IMAGE_STORAGE_UNAVAILABLE') : null, chunk)
    } })
    res.set({ 'Cache-Control': 'private, no-store, max-age=0', 'Vary': 'Authorization', 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff' })
    await pipeline(Readable.fromWeb(body), bounded, res)
}

export function createManagedUploadController({ storageFactory = createImageStorage, lifecycleFactory = createImageLifecycle, attachedForViewer = attachedImageForViewer } = {}) {
  const streamImage = (asset, res) => streamManagedImage(asset, res, storageFactory)
  return {
    async deliverManagedImage(req, res, next) {
      try { await streamImage(await attachedForViewer(req.params.id, req.user), res) }
      catch (error) {
        if (!res.headersSent && !res.destroyed) imageErrorResponse(error, res, next)
        else if (!res.destroyed) res.destroy()
      }
    },
    async discardManagedImage(req, res, next) {
      try {
        const storage = storageFactory()
        await lifecycleFactory({ storage }).discard(req.params.id, req.user._id)
        res.status(204).end()
      } catch (error) { imageErrorResponse(error, res, next) }
    },
    async replaceContentImages(req, res, next) {
      try {
        const { type, id } = req.params
        if (!req.body || Object.keys(req.body).length !== 1 || !Object.hasOwn(req.body, 'imageIds')) throw imageError('IMAGE_REQUEST_INVALID')
        const doc = await authorizeMediaDestination(type, id, req.user)
        const owner = type === 'user' ? doc._id : type === 'message' ? doc.sentBy : doc.reportedBy
        if (!sameId(req.user, owner)) throw imageError('IMAGE_ATTACHMENT_FORBIDDEN')
        if (type === 'message' && !doc.text && !doc.sharedStray && !req.body.imageIds?.length) throw imageError('IMAGE_REQUEST_INVALID')
        const purpose = type === 'user' ? 'avatar' : type
        const result = await commitContentImages({ Model: mediaModels[type], userId: req.user._id, type, purpose,
          existingId: id, imageIds: req.body.imageIds, minimum: type === 'stray' ? 1 : 0,
          authorize: (session) => authorizeMediaDestination(type, id, req.user, { session }) })
        res.json({ success: true, id: String(result.doc._id), images: (result.doc.imageIds || []).map((assetId) => ({ id: String(assetId), url: `/api/uploads/managed/${assetId}/content` })) })
      } catch (error) { imageErrorResponse(error, res, next) }
    },
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
        await streamImage(asset, res)
      } catch (error) {
        if (!res.headersSent && !res.destroyed) imageErrorResponse(error, res, next)
        else if (!res.destroyed) res.destroy()
      }
    },
  }
}

export const { uploadManagedImage, previewManagedImage } = createManagedUploadController()
