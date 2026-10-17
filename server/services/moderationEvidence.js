import mongoose from 'mongoose'
import ContentReport from '../models/ContentReport.js'
import MediaAsset from '../models/MediaAsset.js'
import { mediaModels, authorizeMediaDestination } from './mediaAccess.js'
import { legacyImageKeyForReference, readLegacyImage } from './legacyImageAccess.js'
import { processImage } from './imageProcessing.js'
import { imageError } from './imageErrors.js'

const FIELD = { user: 'avatar', pet: 'photo', sighting: 'photo', stray: 'photo', message: 'photo' }
const REMOTE_HOSTS = new Set(['images.unsplash.com', 'images.pexels.com', 'i.pravatar.cc'])
export function targetEvidenceReferences(target, type) {
  if (!Object.hasOwn(FIELD, type)) return []
  return [...new Set([target[FIELD[type]], ...(['pet', 'stray'].includes(type) ? target.photos || [] : [])]
    .filter((value) => typeof value === 'string' && value.length))].slice(0, 6)
}
export const evidenceImageUrl = (reportId, index) => `/api/moderation/reports/${reportId}/images/${index}`

async function boundedRemoteImage(value, fetchImpl) {
  let url
  try { url = new URL(value) } catch { throw imageError('IMAGE_NOT_FOUND') }
  // No general URL proxy or user-supplied host/redirect. Only existing known
  // image CDNs are supported; private/network destinations fail closed.
  if (url.protocol !== 'https:' || !REMOTE_HOSTS.has(url.hostname) || url.username || url.password || url.port || url.hash) throw imageError('IMAGE_NOT_FOUND')
  const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(15000) })
  if (!response.ok || !response.body) throw imageError('IMAGE_NOT_FOUND')
  const reader = response.body.getReader(), chunks = []
  let bytes = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > 8 * 1024 * 1024) throw imageError('IMAGE_NOT_FOUND')
      chunks.push(Buffer.from(part.value))
    }
  } finally { await reader.cancel().catch(() => undefined) }
  return Buffer.concat(chunks)
}

export function createModerationEvidenceResolver({ Reports = ContentReport, Assets = MediaAsset, models = mediaModels,
  legacyReader = readLegacyImage, processor = processImage, fetchImpl = fetch } = {}) {
  return async (reportId, index, user) => {
    if (user?.role !== 'shelter_admin') throw Object.assign(new Error('Shelter administrator access required.'), { status: 403, code: 'SHELTER_ADMIN_REQUIRED' })
    if (!mongoose.isValidObjectId(reportId) || !/^[0-5]$/.test(String(index))) throw imageError('IMAGE_NOT_FOUND')
    const report = await Reports.findById(reportId).select('+targetOwner').lean()
    if (!report || !Object.hasOwn(FIELD, report.targetType) || !mongoose.isValidObjectId(report.targetId)
      || !mongoose.isValidObjectId(report.reporter) || !['pending', 'reviewed', 'dismissed', 'actioned'].includes(report.status)) throw imageError('IMAGE_NOT_FOUND')
    const type = report.targetType, Model = models[type]
    const target = await Model.findById(report.targetId).select('+imageIds').lean()
    if (!target) throw imageError('IMAGE_NOT_FOUND')
    const owner = type === 'user' ? target._id : type === 'message' ? target.sentBy : target.reportedBy
    if (!mongoose.isValidObjectId(owner) || (report.targetOwner && String(report.targetOwner) !== String(owner))) throw imageError('IMAGE_NOT_FOUND')
    if (String(report.reporter) === String(owner)) throw imageError('IMAGE_NOT_FOUND')
    if (type === 'message') {
      const pet = await models.pet.findById(target.pet).select('reportedBy').lean()
      // Only the SINGLE reported message, never its thread/adjacent messages.
      // A forged/stale report from a non-participant cannot unlock its image.
      if (!pet || ![target.sentBy, target.participant, pet.reportedBy].filter(Boolean).map(String).includes(String(report.reporter))) throw imageError('IMAGE_NOT_FOUND')
    }
    const reference = targetEvidenceReferences(target, type)[Number(index)]
    if (!reference) throw imageError('IMAGE_NOT_FOUND')
    const managed = /^\/api\/uploads\/managed\/([a-f0-9]{24})\/content$/i.exec(reference)
    if (managed) {
      const asset = await Assets.findOne({ _id: managed[1], state: 'attached', 'attachedTo.type': type, 'attachedTo.id': target._id })
        .select('+publicId +providerAssetId +secureUrl +uploadedBy +attachedTo').lean()
      if (!asset || String(asset.uploadedBy) !== String(owner) || asset.purpose !== (type === 'user' ? 'avatar' : type)) throw imageError('IMAGE_NOT_FOUND')
      return { asset }
    }
    let buffer
    if (reference.startsWith('data:')) {
      if (reference.length > 12 * 1024 * 1024) throw imageError('IMAGE_NOT_FOUND')
      const data = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(reference)
      if (!data) throw imageError('IMAGE_NOT_FOUND')
      buffer = Buffer.from(data[1], 'base64')
    } else if (/^(?:(?:https?:)?\/\/[^/?#]+)?\/?uploads\//i.test(reference)) {
      const key = legacyImageKeyForReference(reference)
      const image = await legacyReader(key, user, { models, authorize: async (referenceType, id, viewer, options) => {
        if (referenceType === type && String(id) === String(target._id)) return target
        // Shared local files cannot bypass unrelated private/hidden references.
        return authorizeMediaDestination(referenceType, id, viewer, options)
      } })
      buffer = image.buffer
    } else buffer = await boundedRemoteImage(reference, fetchImpl)
    // Derivative only: originals/DB are unchanged. Strip EXIF/GPS from legacy
    // evidence and validate real raster bytes; SVG/disguised files are rejected.
    const image = await processor(buffer, type === 'user' ? 'avatar' : type)
    return { buffer: image.buffer }
  }
}
