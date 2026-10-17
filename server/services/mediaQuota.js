import mongoose from 'mongoose'
import MediaAsset from '../models/MediaAsset.js'
import MediaUploadBudget from '../models/MediaUploadBudget.js'
import { DATABASE_NAME } from '../config/database.js'
import { IMAGE_LIMITS } from '../config/imageStorage.js'
import { imageError } from './imageErrors.js'

export function uploadQuotaFilters(owner, timestamp) {
  return {
    daily: { uploadedBy: owner, createdAt: { $gte: new Date(timestamp.getTime() - 86400000) } },
    active: { uploadedBy: owner, $or: [
      { state: 'pending', $or: [{ expiresAt: { $gt: timestamp } }, { expiresAt: null }] },
      { state: 'uploading', $or: [
        { uploadLeaseUntil: { $gt: timestamp } },
        { uploadLeaseUntil: null, $or: [{ expiresAt: { $gt: timestamp } }, { expiresAt: null }] },
      ] },
    ] },
    // Expiry is not provider deletion. Unknown/attached objects still consume
    // storage budget; only confirmed deletion or a known collision releases it.
    stored: { uploadedBy: owner, state: { $ne: 'deleted' }, failureCode: { $ne: 'IMAGE_STORAGE_CONFLICT' } },
  }
}
export function assertUploadQuota({ daily, active, stored }) {
  if (daily >= IMAGE_LIMITS.dailyUploads || active >= IMAGE_LIMITS.pendingUploads) throw imageError('IMAGE_UPLOAD_QUOTA')
  if (stored >= IMAGE_LIMITS.storedImages) throw imageError('IMAGE_RECOVERY_QUOTA')
}

export function createUploadReservation({ Assets = MediaAsset, Budgets = MediaUploadBudget,
  connection = Assets.db, expectedDatabase = DATABASE_NAME } = {}) {
  return async (values, timestamp) => {
    if (connection.readyState !== 1 || connection.name !== expectedDatabase) throw imageError('IMAGE_DATABASE_UNAVAILABLE')
    const owner = String(values.uploadedBy)
    if (!mongoose.isValidObjectId(owner)) throw imageError('IMAGE_REQUEST_INVALID')
    try { await Budgets.updateOne({ user: owner }, { $setOnInsert: { user: owner, revision: 0 } }, { upsert: true }) }
    catch (error) { if (error.code !== 11000) throw imageError('IMAGE_DATABASE_UNAVAILABLE') }
    const session = await connection.startSession()
    try {
      await session.withTransaction(async () => {
        const locked = await Budgets.updateOne({ user: owner }, { $inc: { revision: 1 } }, { session })
        if (locked.matchedCount !== 1) throw imageError('IMAGE_DATABASE_UNAVAILABLE')
        const filters = uploadQuotaFilters(owner, timestamp)
        // Commands on a transaction session must be sequential.
        const daily = await Assets.countDocuments(filters.daily).session(session)
        const active = await Assets.countDocuments(filters.active).session(session)
        const stored = await Assets.countDocuments(filters.stored).session(session)
        assertUploadQuota({ daily, active, stored })
        await Assets.create([values], { session })
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } })
    } finally { await session.endSession() }
  }
}
