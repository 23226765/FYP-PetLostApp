import mongoose from 'mongoose'
import User from '../models/User.js'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import Stray from '../models/Stray.js'
import Message from '../models/Message.js'
import MediaAsset from '../models/MediaAsset.js'
import { sameId, canViewExactSightingLocation } from './locationPrivacy.js'
import { visibleContentFilter } from './moderationVisibility.js'
import { usersBlockEachOther } from './trustSafety.js'
import { imageError } from './imageErrors.js'
import { mediaContentUrl } from './mediaAttachments.js'

export const mediaModels = { user: User, pet: Pet, sighting: Sighting, stray: Stray, message: Message }
export async function authorizeMediaDestination(type, id, user, { models = mediaModels, blocks = usersBlockEachOther, session } = {}) {
  if (!Object.hasOwn(models, type)) throw imageError('IMAGE_NOT_FOUND')
  const Model = models[type]
  if (!Model || !mongoose.isValidObjectId(id)) throw imageError('IMAGE_NOT_FOUND')
  let query = Model.findOne(type === 'user' ? { _id: id } : visibleContentFilter({ _id: id }))
  if (session) query = query.session(session)
  const doc = await query
  if (!doc || (type === 'stray' && doc.active === false)) throw imageError('IMAGE_NOT_FOUND')
  if (type === 'sighting' || type === 'message') {
    let petQuery = models.pet.findOne(visibleContentFilter({ _id: doc.pet }))
    if (session) petQuery = petQuery.session(session)
    const pet = await petQuery
    if (!pet) throw imageError('IMAGE_NOT_FOUND')
    if (type === 'sighting' && !canViewExactSightingLocation(user, pet, doc)) throw imageError('IMAGE_NOT_FOUND')
    if (type === 'message') {
      const member = sameId(user, pet.reportedBy) || sameId(user, doc.participant)
      if (!member || await blocks(pet.reportedBy, doc.participant)) throw imageError('IMAGE_NOT_FOUND')
    }
  }
  return doc
}

export async function attachedImageForViewer(id, user, { Assets = MediaAsset, authorize = authorizeMediaDestination } = {}) {
  if (!mongoose.isValidObjectId(id)) throw imageError('IMAGE_NOT_FOUND')
  const asset = await Assets.findOne({ _id: id, state: 'attached' }).select('+state +attachedTo +publicId +secureUrl +uploadedBy +providerAssetId').lean()
  if (!asset?.attachedTo) throw imageError('IMAGE_NOT_FOUND')
  const doc = await authorize(asset.attachedTo.type, asset.attachedTo.id, user)
  // Check actual current reference, not merely the asset's possibly stale ledger.
  const reference = mediaContentUrl(id)
  const references = asset.attachedTo.type === 'user' ? [doc.avatar] : [doc.photo, ...(doc.photos || [])]
  if (!references.includes(reference)) throw imageError('IMAGE_NOT_FOUND')
  return asset
}
