import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import MediaAsset from '../models/MediaAsset.js'
import { DATABASE_NAME } from '../config/database.js'
import { IMAGE_LIMITS } from '../config/imageStorage.js'
import { mediaModels } from './mediaAccess.js'
import { mediaContentUrl } from './mediaAttachments.js'
import { createImageStorage } from './storage/index.js'
import { imageError } from './imageErrors.js'

const FIELDS = '+state +publicId +providerAssetId +secureUrl +uploadedBy +attachedTo +expiresAt +uploadLeaseUntil +uploadLeaseToken +recoveryToken +recoveryLeaseUntil +recoveryFrom +lastRecoveryAt +failureCode'
const date = (value) => value ? new Date(value).getTime() : NaN
export function recoveryEligibility(asset, timestamp) {
  const cutoff = timestamp.getTime() - IMAGE_LIMITS.recoveryGraceMs
  if (asset.failureCode === 'IMAGE_STORAGE_CONFLICT') return 'collision_not_owned'
  if (!['uploading', 'pending', 'delete_pending', 'reconciling'].includes(asset.state)) return 'protected_state'
  if (date(asset.lastRecoveryAt) > cutoff) return 'retry_cooldown'
  const deadline = asset.state === 'reconciling' ? asset.recoveryLeaseUntil
    : asset.state === 'uploading' ? asset.uploadLeaseUntil || asset.expiresAt : asset.expiresAt
  if (!Number.isFinite(date(deadline))) return 'unknown_deadline'
  return date(deadline) <= cutoff ? 'eligible' : 'active_or_grace'
}

export async function imageHasContentReferences(id, models = mediaModels) {
  const url = mediaContentUrl(id)
  for (const [type, Model] of Object.entries(models)) {
    const fields = type === 'user' ? ['avatar'] : ['photo', ...(['pet', 'stray'].includes(type) ? ['photos'] : [])]
    if (await Model.exists({ $or: [{ imageIds: id }, ...fields.map((field) => ({ [field]: url }))] })) return true
  }
  return false
}

export function createMediaReconciler({ Assets = MediaAsset, models = mediaModels, storageFactory = createImageStorage,
  connection = Assets.db, expectedDatabase = DATABASE_NAME, now = () => new Date() } = {}) {
  return async (ids, { apply = false, allowDelete = false } = {}) => {
    if (!Array.isArray(ids) || !ids.length || ids.length > 25 || ids.some((id) => !/^[a-f0-9]{24}$/i.test(String(id)))
      || new Set(ids.map((id) => String(id).toLowerCase())).size !== ids.length || (allowDelete && !apply)) throw imageError('IMAGE_REQUEST_INVALID')
    if (connection.readyState !== 1 || connection.name !== expectedDatabase) throw imageError('IMAGE_DATABASE_UNAVAILABLE')
    const results = []
    for (const id of ids) {
      let asset, claimed, storage
      const result = { id: String(id), outcome: 'not_found' }
      try {
        asset = await Assets.findById(id).select(FIELDS).lean()
        if (!asset) { results.push(result); continue }
        result.outcome = recoveryEligibility(asset, now())
        if (result.outcome !== 'eligible') { results.push(result); continue }
        if (await imageHasContentReferences(id, models)) { result.outcome = 'referenced'; results.push(result); continue }
        if (!apply) { result.outcome = 'would_reconcile'; results.push(result); continue }
        const token = randomUUID(), timestamp = now()
        const unchanged = { _id: id, state: asset.state, updatedAt: asset.updatedAt ?? { $exists: false },
          uploadLeaseUntil: asset.uploadLeaseUntil ?? null, recoveryToken: asset.recoveryToken ?? null }
        claimed = await Assets.findOneAndUpdate(unchanged, { $set: {
          state: 'reconciling', recoveryToken: token,
          recoveryFrom: asset.state === 'reconciling' ? asset.recoveryFrom || 'delete_pending' : asset.state,
          recoveryLeaseUntil: new Date(timestamp.getTime() + IMAGE_LIMITS.recoveryGraceMs), lastRecoveryAt: timestamp,
        }, $inc: { cleanupAttempts: 1 } }, { new: true, runValidators: true }).select(FIELDS).lean()
        if (!claimed) { result.outcome = 'changed_or_claimed'; results.push(result); continue }
        const owned = { _id: id, state: 'reconciling', recoveryToken: token, recoveryLeaseUntil: { $gt: now() } }
        if (await imageHasContentReferences(id, models)) throw imageError('IMAGE_ATTACHMENT_FORBIDDEN')
        storage = storageFactory()
        const found = await storage.stat(claimed)
        if (found && claimed.providerAssetId && found.providerAssetId !== claimed.providerAssetId) throw imageError('IMAGE_STORAGE_CONFLICT')
        if (found && !allowDelete) {
          const restored = await Assets.updateOne(owned, { $set: { state: claimed.recoveryFrom, recoveryLeaseUntil: now() } })
          if (restored.matchedCount !== 1) throw imageError('IMAGE_DATABASE_UNAVAILABLE')
          result.outcome = 'provider_present_delete_not_authorized'
        } else {
          if (!await Assets.exists(owned) || await imageHasContentReferences(id, models)) throw imageError('IMAGE_ATTACHMENT_FORBIDDEN')
          if (found) await storage.deleteImage(claimed) // Exact server-stored ID, never a client public ID.
          if (await storage.stat(claimed) !== null) throw imageError('IMAGE_STORAGE_UNAVAILABLE')
          const completed = await Assets.updateOne(owned, { $set: { ...(found || {}), state: 'deleted', recoveryLeaseUntil: now() } }, { runValidators: true })
          if (completed.matchedCount !== 1) throw imageError('IMAGE_DATABASE_UNAVAILABLE')
          result.outcome = found ? 'deleted_confirmed' : 'absent_confirmed'
        }
      } catch {
        result.outcome = 'recovery_failed'
        if (claimed) {
          // A failed write leaves the claim/token intact for later resumption.
          // A successful write retains the original identity/metadata and debt.
          await Assets.updateOne({ _id: id, state: 'reconciling', recoveryToken: claimed.recoveryToken },
            { $set: { state: 'delete_pending', failureCode: 'IMAGE_STORAGE_UNAVAILABLE', lastRecoveryAt: now() } }).catch(() => undefined)
        }
      }
      results.push(result)
    }
    return { dryRun: !apply, results }
  }
}
