import mongoose from 'mongoose'
import MediaAsset from '../models/MediaAsset.js'
import { DATABASE_NAME } from '../config/database.js'
import { imageError } from './imageErrors.js'
import { createImageStorage } from './storage/index.js'
import { logServerError } from '../middleware/errorHandler.js'
import { visibleContentFilter, isContentVisible } from './moderationVisibility.js'

export const mediaContentUrl = (id) => `/api/uploads/managed/${id}/content`
const FIELDS = '+publicId +providerAssetId +secureUrl +uploadedBy +state +attachedTo +expiresAt'
const MAX_IMAGES = { avatar: 1, pet: 4, sighting: 1, stray: 4, message: 1 }
const managedId = (url) => typeof url === 'string' ? /^\/api\/uploads\/managed\/([a-f0-9]{24})\/content$/.exec(url)?.[1] : undefined
const currentUrls = (doc) => [...new Set([doc.photo, ...(doc.photos || [])].filter((url) => typeof url === 'string' && url))]

export function validateImageIds(ids, purpose, { existing = false } = {}) {
  if (!Object.hasOwn(MAX_IMAGES, purpose) || !Array.isArray(ids) || (!existing && ids.length > MAX_IMAGES[purpose])
    || ids.some((id) => typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id))
    || new Set(ids.map((id) => id.toLowerCase())).size !== ids.length) throw imageError('IMAGE_REQUEST_INVALID')
  return ids.map((id) => id.toLowerCase())
}

function validateAttachments(attachments) {
  if (!Array.isArray(attachments)) throw imageError('IMAGE_REQUEST_INVALID')
  const refs = attachments.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).length !== 1) throw imageError('IMAGE_REQUEST_INVALID')
    if (Object.hasOwn(entry, 'imageId')) return { imageId: validateImageIds([entry.imageId], 'pet')[0] }
    if (Object.hasOwn(entry, 'existingUrl') && typeof entry.existingUrl === 'string' && entry.existingUrl.length) return { existingUrl: entry.existingUrl }
    throw imageError('IMAGE_REQUEST_INVALID')
  })
  const keys = refs.map((entry) => entry.existingUrl ?? mediaContentUrl(entry.imageId))
  if (new Set(keys).size !== keys.length) throw imageError('IMAGE_REQUEST_INVALID')
  return refs
}

export function contentImageReferences(doc, type) {
  const urls = type === 'user' ? [doc.avatar].filter(Boolean) : currentUrls(doc)
  // photo is the primary image and photos keeps the complete explicit order.
  return urls.map((url) => { const id = managedId(url); return id ? { id, url } : { url } })
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
  Model, userId, purpose, type, values = {}, imageIds, attachments, existingId,
  idempotencyFilter, authorize = async () => {}, beforeCreate = async () => {}, validateReplay = () => {}, minimum = 0,
}, {
  Assets = MediaAsset, connection = Model.db, expectedDatabase = DATABASE_NAME,
  retire = retireMediaAssets, now = () => new Date(), retryDuplicate = true,
} = {}) {
  const editableCollection = Boolean(existingId) && ['pet', 'stray'].includes(type)
  if (attachments !== undefined && (!editableCollection || imageIds !== undefined)) throw imageError('IMAGE_REQUEST_INVALID')
  const refs = attachments !== undefined ? validateAttachments(attachments)
    : validateImageIds(imageIds, purpose, { existing: editableCollection }).map((imageId) => ({ imageId }))
  if (refs.length < minimum || !mongoose.isValidObjectId(userId)) throw imageError('IMAGE_REQUEST_INVALID')
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
        if (oldIds.join(',') !== refs.map((entry) => entry.imageId).join(',')) throw imageError('IMAGE_IDEMPOTENCY_CONFLICT')
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
      const oldUrls = currentUrls(doc)
      const resolved = refs.map((entry) => {
        if (entry.existingUrl !== undefined) {
          if (!oldUrls.includes(entry.existingUrl)) throw imageError('IMAGE_ATTACHMENT_FORBIDDEN')
          return { id: managedId(entry.existingUrl), url: entry.existingUrl, retained: true }
        }
        const url = mediaContentUrl(entry.imageId)
        return { id: entry.imageId, url, retained: oldUrls.includes(url) }
      })
      const ids = resolved.flatMap((entry) => entry.id ? [entry.id] : [])
      if (new Set(ids).size !== ids.length) throw imageError('IMAGE_REQUEST_INVALID')
      // Grandfather only references still present on this destination. A new
      // pending upload cannot be claimed until the complete final set fits four.
      if (resolved.length > MAX_IMAGES[purpose] && (!editableCollection || resolved.some((entry) => !entry.retained))) throw imageError('IMAGE_REQUEST_INVALID')
      const targetId = String(doc._id)
      const assets = ids.length ? await Assets.find({ _id: { $in: ids } }).select(FIELDS).session(session) : []
      if (assets.length !== ids.length) throw imageError('IMAGE_ATTACHMENT_FORBIDDEN')
      for (const asset of assets) {
        const sameDestination = asset.state === 'attached' && asset.attachedTo?.type === type && String(asset.attachedTo.id) === targetId
        if (String(asset.uploadedBy) !== String(userId) || asset.purpose !== purpose
          || (resolved.find((entry) => entry.id === String(asset._id))?.retained && !sameDestination)
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
      const urls = resolved.map((entry) => entry.url)
      if (type === 'user') doc.avatar = urls[0] || ''
      else { doc.photo = urls[0] || ''; if (['pet', 'stray'].includes(type)) doc.photos = urls }
      await doc.save({ session })
      detached = [...new Set([...oldIds, ...oldUrls.map(managedId).filter(Boolean)])].filter((id) => !ids.includes(id))
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
  if (collided) return commitContentImages({ Model, userId, purpose, type, values, imageIds, attachments, existingId, idempotencyFilter, authorize, beforeCreate, validateReplay, minimum },
    { Assets, connection, expectedDatabase, retire, now, retryDuplicate: false })
  // Never delete the old provider object before the new DB state commits.
  if (detached.length) {
    try { await retire(detached) }
    catch (error) { logServerError('Detached image recovery deferred', error) }
  }
  return result
}
