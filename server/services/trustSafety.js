import mongoose from 'mongoose'
import Message from '../models/Message.js'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import Stray from '../models/Stray.js'
import StrayComment from '../models/StrayComment.js'
import User from '../models/User.js'
import UserBlock from '../models/UserBlock.js'
import { visibleContentFilter } from './moderationVisibility.js'

function asId(value) {
  const id = value?._id ?? value?.id ?? value
  return mongoose.isValidObjectId(id) ? String(id) : ''
}

export async function blockedUserIdsFor(userId) {
  const normalizedUserId = asId(userId)
  if (!normalizedUserId) return new Set()

  const relationships = await UserBlock.find({
    $or: [{ blocker: normalizedUserId }, { blocked: normalizedUserId }],
  }).select('blocker blocked')

  return new Set(
    relationships
      .map((relationship) => {
        const blocker = asId(relationship.blocker)
        return blocker === normalizedUserId
          ? asId(relationship.blocked)
          : blocker
      })
      .filter(Boolean),
  )
}

export async function usersBlockEachOther(firstUserId, secondUserId) {
  const first = asId(firstUserId)
  const second = asId(secondUserId)
  if (!first || !second || first === second) return false
  return Boolean(await UserBlock.exists({
    $or: [
      { blocker: first, blocked: second },
      { blocker: second, blocked: first },
    ],
  }))
}

async function resolveMessageTarget(targetId, reporterId) {
  const message = await Message.findById(targetId).select('sentBy participant pet')
  if (!message) return null

  const pet = await Pet.findById(message.pet).select('reportedBy')
  if (!pet) return null
  const allowed = [message.sentBy, message.participant, pet.reportedBy]
    .map(asId)
    .includes(asId(reporterId))
  if (!allowed) return { forbidden: true }
  return { ownerId: asId(message.sentBy) }
}

/** Resolve a report target without returning its content or private fields. */
export async function resolveReportTarget(targetType, targetId, reporterId) {
  if (!mongoose.isValidObjectId(targetId)) return null

  if (targetType === 'pet') {
    const target = await Pet.findOne(visibleContentFilter({ _id: targetId })).select('reportedBy')
    return target ? { ownerId: asId(target.reportedBy) } : null
  }
  if (targetType === 'sighting') {
    const target = await Sighting.findOne(
      visibleContentFilter({ _id: targetId }),
    ).select('reportedBy pet')
    if (!target || !await Pet.exists(visibleContentFilter({ _id: target.pet }))) return null
    return { ownerId: asId(target.reportedBy) }
  }
  if (targetType === 'stray') {
    const target = await Stray.findOne(visibleContentFilter({
      _id: targetId,
      active: { $ne: false },
    })).select('reportedBy')
    return target ? { ownerId: asId(target.reportedBy) } : null
  }
  if (targetType === 'comment') {
    const target = await StrayComment.findOne(
      visibleContentFilter({ _id: targetId }),
    ).select('author stray')
    if (!target || !await Stray.exists(visibleContentFilter({
      _id: target.stray,
      active: { $ne: false },
    }))) return null
    return { ownerId: asId(target.author) }
  }
  if (targetType === 'message') return resolveMessageTarget(targetId, reporterId)
  if (targetType === 'user') {
    const target = await User.findById(targetId).select('_id')
    return target ? { ownerId: asId(target._id) } : null
  }
  return null
}
