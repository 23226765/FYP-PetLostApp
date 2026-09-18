import mongoose from 'mongoose'
import User from '../models/User.js'

export const CONTACT_VISIBILITIES = Object.freeze(['private', 'authenticated'])
export const DEFAULT_CONTACT_VISIBILITY = 'private'

export function contactVisibilityFor(user) {
  const value = user?.privacy?.contactVisibility
  return CONTACT_VISIBILITIES.includes(value) ? value : DEFAULT_CONTACT_VISIBILITY
}

function userId(value) {
  const id = value?._id ?? value?.id ?? value
  return mongoose.isValidObjectId(id) ? String(id) : ''
}

export function canViewContact(requester, contactOwner) {
  const requesterId = userId(requester)
  const ownerId = userId(contactOwner)
  if (!requesterId || !ownerId) return false
  if (requesterId === ownerId) return true
  return contactVisibilityFor(contactOwner) === 'authenticated'
}

export function serializeContact({
  requester,
  contactOwner,
  phoneField = 'phone',
  contextAllowed = true,
}) {
  const permitted = Boolean(contextAllowed && canViewContact(requester, contactOwner))
  const result = { canViewContact: permitted }
  const phone = typeof contactOwner?.phone === 'string' ? contactOwner.phone.trim() : ''
  if (permitted && phone) result[phoneField] = phone
  return result
}

export async function loadContactOwners(documents, referenceField = 'reportedBy') {
  const ids = [
    ...new Set(
      documents
        .map((document) => userId(document?.[referenceField]))
        .filter(Boolean),
    ),
  ]
  if (ids.length === 0) return new Map()

  const users = await User.find({ _id: { $in: ids } }).select(
    '_id name phone privacy.contactVisibility',
  )
  return new Map(users.map((user) => [String(user._id), user]))
}

export function contactOwnerFrom(map, reference) {
  const id = userId(reference)
  return id ? map.get(id) || null : null
}
