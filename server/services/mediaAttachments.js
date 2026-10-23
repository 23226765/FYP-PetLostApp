import mongoose from 'mongoose'
import MediaAsset from '../models/MediaAsset.js'
import { DATABASE_NAME } from '../config/database.js'
import { imageError } from './imageErrors.js'
import { createImageStorage } from './storage/index.js'
import { logServerError } from '../middleware/errorHandler.js'
import { visibleContentFilter, isContentVisible } from './moderationVisibility.js'

export const mediaContentUrl = (id) => `/api/uploads/managed/${id}/content`
const FIELDS = '+publicId +providerAssetId +secureUrl +uploadedBy +state +attachedTo +expiresAt'
const MAX_IMAGES = { avatar: 1, pet: 6, sighting: 1, stray: 6, message: 1 }

export function validateImageIds(ids, purpose) {
  if (!Object.hasOwn(MAX_IMAGES, purpose) || !Array.isArray(ids) || ids.length > MAX_IMAGES[purpose]
    || ids.some((id) => typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id))
    || new Set(ids.map((id) => id.toLowerCase())).size !== ids.length) throw imageError('IMAGE_REQUEST_INVALID')
  return ids.map((id) => id.toLowerCase())
}

/** New writes may not inject a URL, Base64 string, or even a guessed managed path. */
export function rejectImageStrings(body) {
  if (['photo', 'photos', 'avatar'].some((field) => Object.hasOwn(body || {}, field))) {
    throw imageError('IMAGE_IDS_REQUIRED')
  }
}

export async function retireMediaAssets(ids, { Assets = MediaAsset, storageFactory = createImageStorage } = {}) {
  // Only IDs just detached by an acknowledged transaction, never a cleanup scan.
  for (const id of ids) {
    try {
      const asset = await Assets.findOne({ _id: id, state: 'delete_pending' }).select(FIELDS).lean()
      if (!asset) continue
      await storageFactory().deleteImage(asset)
      await Assets.updateOne({ _id: id, state: 'delete_pending' }, { $set: { state: 'deleted' }, $inc: { cleanupAttempts: 1 } })
    } catch (error) { logServerError('Detached image deletion deferred', error) }
  }
}

/** Atomically bind assets and content. Failed attachment leaves pending uploads retryable.
 * The transaction callback contains no Cloudinary/network delivery side effects.
 */
export async function commitContentImages({
  Model, userId, purpose, type, values = {}, imageIds, existingId,
  idempotencyFilter, authorize = async () => {}, beforeCreate = async () => {}, validateReplay = () => {}, minimum = 0,
}, {
  Assets = MediaAsset, connection = Model.db, expectedDatabase = DATABASE_NAME,
  retire = retireMediaAssets, now = () => new Date(), retryDuplicate = true,
} = {}) {
  const ids = validateImageIds(imageIds, purpose)
  if (ids.length < minimum || !mongoose.isValidObjectId(userId)) throw imageError('IMAGE_REQUEST_INVALID')
  if (connection.readyState !== 1 || connection.name !== expectedDatabase) throw imageError('IMAGE_DATABASE_UNAVAILABLE')
  let session
  try { session = await connection.startSession() }
  catch { throw imageError('IMAGE_DATABASE_UNAVAILABLE') }
  let result, detached = [], collided = false
  try {
    await session.withTransaction(async () => {
      // withTransaction may retry this whole callback; reset all local outcomes.
      detached = []
      await authorize(session)
      let doc = existingId
        ? await Model.findOne(visibleContentFilter({
          _id: existingId, ...(type === 'stray' ? { active: { $ne: false } } : {}),
        })).select('+imageIds').session(session)
        : idempotencyFilter ? await Model.findOne(idempotencyFilter).select('+imageIds +moderationStatus').session(session) : null
      if (existingId && !doc) throw imageError('IMAGE_NOT_FOUND')
      if (doc && !isContentVisible(doc)) throw imageError('IMAGE_NOT_FOUND')
      if (doc && type === 'stray' && doc.active === false) throw imageError('IMAGE_NOT_FOUND')
      const owner = type === 'user' ? doc?._id : type === 'message' ? doc?.sentBy : doc?.reportedBy
      if (doc && String(owner) !== String(userId)) throw imageError('IMAGE_ATTACHMENT_FORBIDDEN')
      if (doc && !existingId) {
        validateReplay(doc)
        const oldIds = (doc.imageIds || []).map(String)
        if (oldIds.join(',') !== ids.join(',')) throw imageError('IMAGE_IDEMPOTENCY_CONFLICT')
        result = { doc, duplicate: true }; return
      }
      if (!doc) {
        // Creation-only side effects share the transaction and must not run
        // again when an idempotent request resolves to an existing document.
        await beforeCreate(session)
        doc = new Model({ ...values, _id: new mongoose.Types.ObjectId() })
      }
      const destinationOwner = type === 'user' ? doc._id : type === 'message' ? doc.sentBy : doc.reportedBy
      if (String(destinationOwner) !== String(userId)) throw imageError('IMAGE_ATTACHMENT_FORBIDDEN')
      const oldIds = (doc.imageIds || []).map(String)
      const targetId = String(doc._id)
      const assets = ids.length ? await Assets.find({ _id: { $in: ids } }).select(FIELDS).session(session) : []
      if (assets.length !== ids.length) throw imageError('IMAGE_ATTACHMENT_FORBIDDEN')
      for (const asset of assets) {
        const sameDestination = asset.state === 'attached' && asset.attachedTo?.type === type && String(asset.attachedTo.id) === targetId
        if (String(asset.uploadedBy) !== String(userId) || asset.purpose !== purpose
          || (!sameDestination && (asset.state !== 'pending' || new Date(asset.expiresAt) <= now()))) {
          throw imageError('IMAGE_ATTACHMENT_FORBIDDEN')
        }
        if (!sameDestination) {
          const claim = await Assets.updateOne({ _id: asset._id, uploadedBy: userId, purpose, state: 'pending', expiresAt: { $gt: now() } },
            { $set: { state: 'attached', attachedTo: { type, id: doc._id } } }, { session, runValidators: true })
          if (claim.matchedCount !== 1) throw imageError('IMAGE_ATTACHMENT_FORBIDDEN')
        }
      }
      doc.set(values)
      doc.imageIds = ids
      // Even an identical rescue edit must write the destination: concurrent
      // deactivation/ownership/moderation changes then conflict and force a fresh
      // eligibility check, rather than allowing a read-only snapshot to succeed.
      if (type === 'stray') doc.markModified('imageIds')
      const urls = ids.map(mediaContentUrl)
      if (type === 'user') doc.avatar = urls[0] || ''
      else { doc.photo = urls[0] || ''; if (['pet', 'stray'].includes(type)) doc.photos = urls }
      await doc.save({ session })
      detached = oldIds.filter((id) => !ids.includes(id))
      if (detached.length) {
        await Assets.updateMany({ _id: { $in: detached }, uploadedBy: userId, state: 'attached', 'attachedTo.type': type, 'attachedTo.id': doc._id },
          { $set: { state: 'delete_pending' } }, { session })
      }
      result = { doc, duplicate: false }
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } })
  } catch (error) {
    if (error?.code?.startsWith?.('IMAGE_')) throw error
    if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) throw error
    if (error?.code === 11000 && retryDuplicate && idempotencyFilter && !existingId) collided = true
    else if (error?.code === 11000) throw imageError('IMAGE_IDEMPOTENCY_CONFLICT')
    else {
      logServerError('Image attachment transaction failed', error)
      throw imageError('IMAGE_DATABASE_UNAVAILABLE')
    }
  } finally { await session.endSession() }
  // A simultaneous identical request may win the unique submission index. Read
  // it in a fresh transaction, repeating authorization and identity checks.
  if (collided) return commitContentImages({ Model, userId, purpose, type, values, imageIds: ids, existingId, idempotencyFilter, authorize, beforeCreate, validateReplay, minimum },
    { Assets, connection, expectedDatabase, retire, now, retryDuplicate: false })
  // Never delete the old provider object before the new DB state commits.
  if (detached.length) {
    try { await retire(detached) }
    catch (error) { logServerError('Detached image recovery deferred', error) }
  }
  return result
}
