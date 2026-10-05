import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import MediaAsset from '../models/MediaAsset.js'
import { DATABASE_NAME } from '../config/database.js'
import { IMAGE_LIMITS, IMAGE_PURPOSES } from '../config/imageStorage.js'
import { processImage } from './imageProcessing.js'
import { imageError } from './imageErrors.js'
import { logServerError } from '../middleware/errorHandler.js'

const PRIVATE_FIELDS = '+publicId +providerAssetId +secureUrl +uploadedBy +state +attachedTo +checksum +idempotencyKey +expiresAt +failureCode'
export const mediaRepository = Object.freeze({
  assertDatabase() {
    if (MediaAsset.db.readyState !== 1 || MediaAsset.db.name !== DATABASE_NAME) {
      throw imageError('IMAGE_DATABASE_UNAVAILABLE')
    }
  },
  find(filter) { return MediaAsset.findOne(filter).select(PRIVATE_FIELDS).lean() },
  count(filter) { return MediaAsset.countDocuments(filter) },
  create(values) { return MediaAsset.create(values) },
  async update(id, states, values) {
    const result = await MediaAsset.updateOne(
      { _id: id, state: { $in: states } }, { $set: values }, { runValidators: true },
    )
    return result.matchedCount === 1
  },
})

export function publicPendingImage(asset) {
  return {
    id: String(asset._id), url: `/api/uploads/managed/${asset._id}/${asset.state === 'attached' ? 'content' : 'preview'}`,
    width: asset.width, height: asset.height, format: asset.format, bytes: asset.bytes,
  }
}

/** Upload reservations are separate from transactional content attachment. */
export function createImageLifecycle({
  storage, repository = mediaRepository, processor = processImage, now = () => new Date(),
  logger = logServerError,
}) {
  async function compensate(asset, failureCode) {
    // Reservation existed before contacting Cloudinary. If MongoDB is now down,
    // leave the ledger intact. Reconcile later rather than deleting an asset whose
    // final database state is unknown (especially once Phase 2 can attach it).
    let current
    try { current = await repository.find({ _id: asset._id }) }
    catch { logger('Image recovery requires reconciliation', imageError('IMAGE_DATABASE_UNAVAILABLE')); return }
    if (current?.state === 'attached') return
    let claimed
    try { claimed = await repository.update(asset._id, ['uploading', 'pending'], { state: 'delete_pending', failureCode }) }
    catch { logger('Image recovery requires reconciliation', imageError('IMAGE_DATABASE_UNAVAILABLE')); return }
    if (!claimed) return
    try {
      await storage.deleteImage(asset)
      await repository.update(asset._id, ['delete_pending'], { state: 'deleted', cleanupAttempts: 1 })
    } catch {
      // Keep delete_pending + the exact server-generated ID for future retries.
      logger('Image rollback pending', imageError('IMAGE_STORAGE_UNAVAILABLE'))
    }
  }

  return Object.freeze({
    async discard(id, userId) {
      if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(userId)) throw imageError('IMAGE_NOT_FOUND')
      repository.assertDatabase()
      const asset = await repository.find({ _id: id, uploadedBy: String(userId) })
      if (!asset) throw imageError('IMAGE_NOT_FOUND')
      if (asset.state === 'deleted') return
      if (!['pending', 'delete_pending'].includes(asset.state)) throw imageError('IMAGE_UPLOAD_IN_PROGRESS')
      if (asset.state === 'pending' && !await repository.update(id, ['pending'], { state: 'delete_pending' })) throw imageError('IMAGE_UPLOAD_IN_PROGRESS')
      try {
        await storage.deleteImage(asset)
        if (!await repository.update(id, ['delete_pending'], { state: 'deleted', cleanupAttempts: 1 })) throw imageError('IMAGE_DATABASE_UNAVAILABLE')
      } catch { throw imageError('IMAGE_STORAGE_UNAVAILABLE') }
    },
    async upload({ userId, purpose, idempotencyKey, buffer }) {
      if (!mongoose.isValidObjectId(userId)) throw imageError('IMAGE_REQUEST_INVALID')
      if (!Object.hasOwn(IMAGE_PURPOSES, purpose)) throw imageError('IMAGE_PURPOSE_INVALID')
      if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)) {
        throw imageError('IMAGE_REQUEST_INVALID')
      }
      repository.assertDatabase()
      const processed = await processor(buffer, purpose)
      const owner = String(userId)
      const timestamp = now()
      let existing
      try { existing = await repository.find({ uploadedBy: owner, idempotencyKey }) }
      catch { throw imageError('IMAGE_DATABASE_UNAVAILABLE') }
      if (existing) {
        if (existing.checksum !== processed.checksum || existing.purpose !== purpose) {
          throw imageError('IMAGE_IDEMPOTENCY_CONFLICT')
        }
        if (existing.state === 'attached' || (existing.state === 'pending' && new Date(existing.expiresAt) > timestamp)) {
          return { image: publicPendingImage(existing), duplicate: true }
        }
        if (['deleted', 'failed', 'delete_pending', 'pending'].includes(existing.state)) throw imageError('IMAGE_UPLOAD_RETRY_REQUIRED')
        throw imageError('IMAGE_UPLOAD_IN_PROGRESS')
      }

      let daily, pending
      try {
        [daily, pending] = await Promise.all([
          repository.count({ uploadedBy: owner, createdAt: { $gte: new Date(timestamp.getTime() - 86_400_000) } }),
          repository.count({ uploadedBy: owner, state: { $in: ['uploading', 'pending', 'delete_pending'] } }),
        ])
      } catch { throw imageError('IMAGE_DATABASE_UNAVAILABLE') }
      if (daily >= IMAGE_LIMITS.dailyUploads || pending >= IMAGE_LIMITS.pendingUploads) {
        throw imageError('IMAGE_UPLOAD_QUOTA')
      }

      const reservation = {
        _id: new mongoose.Types.ObjectId(), provider: storage.provider,
        publicId: storage.publicIdFor(purpose, randomUUID()), uploadedBy: owner, purpose,
        checksum: processed.checksum, idempotencyKey, state: 'uploading',
        expiresAt: new Date(timestamp.getTime() + IMAGE_LIMITS.pendingLifetimeMs),
      }
      try { await repository.create(reservation) }
      catch (error) {
        if (error?.code === 11000) throw imageError('IMAGE_UPLOAD_IN_PROGRESS')
        // Never upload if the reservation write wasn't acknowledged.
        throw imageError('IMAGE_DATABASE_UNAVAILABLE')
      }
      let metadata
      try {
        metadata = await storage.uploadImage(processed.buffer, reservation)
        if (
          metadata.publicId !== reservation.publicId || metadata.provider !== reservation.provider
          || metadata.width !== processed.width || metadata.height !== processed.height
          || metadata.bytes !== processed.bytes || metadata.format !== processed.format
        ) throw imageError('IMAGE_STORAGE_UNAVAILABLE')
      } catch (error) {
        if (error?.code === 'IMAGE_STORAGE_CONFLICT') {
          try { await repository.update(reservation._id, ['uploading'], { state: 'failed', failureCode: 'IMAGE_STORAGE_CONFLICT' }) }
          catch { logger('Image collision requires reconciliation', imageError('IMAGE_DATABASE_UNAVAILABLE')) }
          // The provider says it already existed, so this attempt does not own it.
          // Never compensate by deleting that object.
          throw imageError('IMAGE_STORAGE_CONFLICT')
        }
        await compensate(reservation, 'IMAGE_STORAGE_UNAVAILABLE')
        throw imageError('IMAGE_STORAGE_UNAVAILABLE')
      }
      try {
        const saved = await repository.update(reservation._id, ['uploading'], { ...metadata, state: 'pending' })
        if (!saved) throw imageError('IMAGE_DATABASE_UNAVAILABLE')
      } catch {
        // A write may have committed despite a network error. Acknowledged
        // metadata can be reused; don't delete a successfully saved image.
        let current
        try { current = await repository.find({ _id: reservation._id }) } catch { /* reconciled below */ }
        if (current?.state === 'pending' && current.publicId === reservation.publicId && current.secureUrl === metadata.secureUrl) {
          return { image: publicPendingImage(current), duplicate: false }
        }
        await compensate(reservation, 'IMAGE_DATABASE_UNAVAILABLE')
        throw imageError('IMAGE_DATABASE_UNAVAILABLE')
      }
      return { image: publicPendingImage({ ...reservation, ...metadata }), duplicate: false }
    },
    async pendingForUser(id, userId) {
      if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(userId)) throw imageError('IMAGE_NOT_FOUND')
      repository.assertDatabase()
      let asset
      try { asset = await repository.find({ _id: id, uploadedBy: String(userId), state: 'pending' }) }
      catch { throw imageError('IMAGE_DATABASE_UNAVAILABLE') }
      if (!asset || new Date(asset.expiresAt) <= now()) throw imageError('IMAGE_NOT_FOUND')
      return asset
    },
  })
}
