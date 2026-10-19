import mongoose from 'mongoose'
import Notification from '../models/Notification.js'
import Pet from '../models/Pet.js'
import Stray from '../models/Stray.js'
import User from '../models/User.js'
import Message from '../models/Message.js'
import StrayComment from '../models/StrayComment.js'
import Sighting from '../models/Sighting.js'
import { setLocationPrivacyHeaders } from '../services/locationPrivacy.js'
import { blockedUserIdsFor } from '../services/trustSafety.js'
import {
  isContentVisible,
  visibleContentFilter,
} from '../services/moderationVisibility.js'

const MAX_ALERT_RADIUS_KM = 50

function isPointCoordinates(value) {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((coordinate) => Number.isFinite(Number(coordinate))) &&
    Number(value[0]) >= -180 &&
    Number(value[0]) <= 180 &&
    Number(value[1]) >= -90 &&
    Number(value[1]) <= 90
  )
}

function relativeTime(date) {
  const elapsed = Math.max(0, Date.now() - new Date(date).getTime())
  const minutes = Math.floor(elapsed / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function distanceKm([lngA, latA], [lngB, latB]) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180
  const latDelta = toRadians(latB - latA)
  const lngDelta = toRadians(lngB - lngA)
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(latA)) * Math.cos(toRadians(latB)) * Math.sin(lngDelta / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function notificationReferenceId(value) {
  return value?._id ? String(value._id) : value ? String(value) : ''
}

function coarseNotificationBody(notification, petById, strayById) {
  const pet = petById.get(notificationReferenceId(notification.pet))
  const stray = strayById.get(notificationReferenceId(notification.stray))
  const district = pet?.district || stray?.district || 'the reported area'

  if (notification.type === 'sighting') {
    return pet
      ? `${pet.name} was spotted in ${district}.`
      : `A pet was spotted in ${district}.`
  }
  if (notification.type === 'proximity') {
    return pet
      ? `${pet.name} (${pet.breed || pet.species}) was reported in ${district}.`
      : `A lost pet was reported in ${district}.`
  }
  return notification.body
}

function serializeNotification(notification, petById, strayById, context = {}) {
  const petId = notificationReferenceId(notification.pet || context.message?.pet || context.sighting?.pet)
  const strayId = notificationReferenceId(notification.stray || context.comment?.stray || context.message?.sharedStray)
  const pet = petById.get(petId)
  const stray = strayById.get(strayId)
  const params = {
    petName: pet?.name || '',
    district: pet?.district || stray?.district || '',
    species: pet?.species || '',
    breed: pet?.breed || '',
  }
  let code = notification.type
  let body = coarseNotificationBody({ type: notification.type, pet: petId, stray: strayId }, petById, strayById)
  if (notification.type === 'message') {
    const message = context.message
    code = message.text ? 'message.text' : message.sharedStray ? 'message.sharedPost' : 'message.photo'
    if (message.text) params.text = message.text
    body = message.text || (message.sharedStray ? 'Shared a stray animal post.' : 'Shared a photo.')
  } else if (notification.type === 'comment') {
    params.text = context.comment?.text || ''
    body = params.text
  } else if (notification.type === 'reunited') {
    body = pet ? `${pet.name} has been reunited.` : 'A pet has been reunited.'
  }
  const titles = { proximity: 'Lost pet near you', sighting: pet ? `New sighting of ${pet.name}` : 'New pet sighting', message: 'New PawRadar message', reunited: 'Pet reunited', comment: 'New comment' }
  return {
    id: String(notification._id),
    type: notification.type,
    title: titles[notification.type],
    body,
    event: { code, params },
    createdAt: notification.createdAt,
    conversation: context.conversation,
    photo: typeof notification.photo === 'string' && notification.photo.startsWith('/api/uploads/managed/')
      ? petById.get(notificationReferenceId(notification.pet))?.photo || strayById.get(notificationReferenceId(notification.stray))?.photo || undefined
      : notification.photo || undefined,
    petId: petId || undefined,
    strayId: strayId || undefined,
    sightingId: notification.sighting ? String(notification.sighting?._id || notification.sighting) : undefined,
    time: relativeTime(notification.createdAt),
    read: Boolean(notification.read) || Boolean(context.message?.readBy?.some((reader) => String(reader) === String(notification.user))),
  }
}

async function serializeNotifications(notifications, userId) {
  const viewerId = String(userId)
  const blocked = await blockedUserIdsFor(userId)
  const messageIds = [...new Set(notifications
    .filter((item) => item.type === 'message')
    .map((item) => notificationReferenceId(item.message)).filter(Boolean))]
  const sightingIds = [...new Set(
    notifications.map((item) => notificationReferenceId(item.sighting)).filter(Boolean),
  )]
  const commentIds = [...new Set(
    notifications.map((item) => notificationReferenceId(item.comment)).filter(Boolean),
  )]
  const [sightings, comments, messages] = await Promise.all([
    sightingIds.length
      ? Sighting.find(visibleContentFilter({ _id: { $in: sightingIds } })).select('_id pet')
      : [],
    commentIds.length
      ? StrayComment.find(visibleContentFilter({ _id: { $in: commentIds } })).select('_id stray author text')
      : [],
    messageIds.length
      ? Message.find({ _id: { $in: messageIds } }).select('_id pet participant sender sentBy text sharedStray readBy')
      : [],
  ])
  const petIds = [...new Set([
    ...notifications.map((item) => notificationReferenceId(item.pet)),
    ...sightings.map((item) => notificationReferenceId(item.pet)),
    ...messages.map((item) => notificationReferenceId(item.pet)),
  ].filter(Boolean))]
  const strayIds = [...new Set([
    ...notifications.map((item) => notificationReferenceId(item.stray)),
    ...comments.map((item) => notificationReferenceId(item.stray)),
    ...messages.map((item) => notificationReferenceId(item.sharedStray)),
  ].filter(Boolean))]
  const [pets, strays] = await Promise.all([
    petIds.length
      ? Pet.find(visibleContentFilter({ _id: { $in: petIds } }))
          .select('_id name species breed district photo reportedBy')
      : [],
    strayIds.length
      ? Stray.find(visibleContentFilter({
          _id: { $in: strayIds },
          active: { $ne: false },
        })).select('_id district photo')
      : [],
  ])
  const petById = new Map(pets.map((pet) => [String(pet._id), pet]))
  const strayById = new Map(strays.map((stray) => [String(stray._id), stray]))
  const sightingById = new Map(sightings.map((sighting) => [String(sighting._id), sighting]))
  const commentById = new Map(comments.map((comment) => [String(comment._id), comment]))
  const messageById = new Map(messages.map((message) => [String(message._id), message]))
  const contextById = new Map()
  const visibleNotifications = notifications.filter((notification) => {
    if (notificationReferenceId(notification.user) !== viewerId) return false
    const petId = notificationReferenceId(notification.pet)
    const strayId = notificationReferenceId(notification.stray)
    const sightingId = notificationReferenceId(notification.sighting)
    const commentId = notificationReferenceId(notification.comment)
    if (petId && !petById.has(petId)) return false
    if (strayId && !strayById.has(strayId)) return false
    if (sightingId) {
      const sighting = sightingById.get(sightingId)
      if (!sighting || !petById.has(notificationReferenceId(sighting.pet))) return false
      if (petId && petId !== notificationReferenceId(sighting.pet)) return false
    }
    if (commentId) {
      const comment = commentById.get(commentId)
      if (!comment || !strayById.has(notificationReferenceId(comment.stray))) return false
      if (strayId && strayId !== notificationReferenceId(comment.stray)) return false
      if (notification.type === 'comment' && blocked.has(notificationReferenceId(comment.author))) return false
    }
    if (notification.type === 'comment' && !commentId) return false
    const context = { comment: commentById.get(commentId), sighting: sightingById.get(sightingId) }
    if (notification.type === 'message') {
      const message = messageById.get(notificationReferenceId(notification.message))
      if (!message) return false
      const messagePetId = notificationReferenceId(message.pet)
      const participantId = notificationReferenceId(message.participant)
      const pet = petById.get(messagePetId)
      const ownerId = notificationReferenceId(pet?.reportedBy)
      if (!pet || !mongoose.isValidObjectId(participantId) || !ownerId || ownerId === participantId) return false
      if (petId && petId !== messagePetId) return false
      if (!['finder', 'owner'].includes(message.sender)) return false
      const senderId = message.sender === 'finder' ? participantId : ownerId
      const recipientId = message.sender === 'finder' ? ownerId : participantId
      if (recipientId !== viewerId || blocked.has(senderId)) return false
      if (message.sentBy && notificationReferenceId(message.sentBy) !== senderId) return false
      const sharedStrayId = notificationReferenceId(message.sharedStray)
      if (sharedStrayId && !strayById.has(sharedStrayId)) return false
      if (strayId && strayId !== sharedStrayId) return false
      context.message = message
      context.conversation = { petId: messagePetId, participantId, messageId: String(message._id) }
    }
    contextById.set(String(notification._id), context)
    return true
  })
  return visibleNotifications.map((notification) =>
    serializeNotification(notification, petById, strayById, contextById.get(String(notification._id))),
  )
}

async function findAlertRecipients(origin, excludedUserId) {
  let users
  try {
    users = await User.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: origin },
          distanceField: 'distanceMeters',
          maxDistance: MAX_ALERT_RADIUS_KM * 1000,
          spherical: true,
          key: 'alertLocation',
          query: { alertsEnabled: { $ne: false } },
        },
      },
      { $project: { _id: 1, alertRadiusKm: 1, distanceMeters: 1 } },
    ])
  } catch {
    // Preserve delivery if a deployment temporarily rejects geo aggregation
    // while its spatial index is becoming available.
    const candidates = await User.find({
      alertsEnabled: { $ne: false },
      alertLocation: { $exists: true },
    }).select('_id alertLocation alertRadiusKm')
    users = candidates.map((user) => ({
      _id: user._id,
      alertRadiusKm: user.alertRadiusKm,
      distanceMeters: isPointCoordinates(user.alertLocation?.coordinates)
        ? distanceKm(origin, user.alertLocation.coordinates.map(Number)) * 1000
        : Number.POSITIVE_INFINITY,
    }))
  }

  return users.filter((user) => {
    if (excludedUserId && String(user._id) === String(excludedUserId)) return false
    const radius = Math.min(MAX_ALERT_RADIUS_KM, Math.max(1, Number(user.alertRadiusKm) || 3))
    return Number(user.distanceMeters) <= radius * 1000
  })
}

/** Persist alerts for eligible nearby users and the owner of a sighted pet. */
export async function createRadiusNotifications({ pet, sighting, type, origin, excludeUserId }) {
  if (
    !pet?._id
    || !isPointCoordinates(origin)
    || !isContentVisible(pet)
    || (sighting && !isContentVisible(sighting))
  ) return

  const recipients = await findAlertRecipients(origin.map(Number), excludeUserId)
  const recipientsById = new Map(recipients.map((user) => [String(user._id), user]))

  if (type === 'sighting' && pet.reportedBy && String(pet.reportedBy) !== String(excludeUserId)) {
    recipientsById.set(String(pet.reportedBy), { _id: pet.reportedBy })
  }
  if (recipientsById.size === 0) return

  const isSighting = type === 'sighting'
  const district = typeof pet.district === 'string' && pet.district.trim()
    ? pet.district.trim()
    : 'the reported area'
  const documents = [...recipientsById.values()].map((user) => ({
    user: user._id,
    pet: pet._id,
    sighting: sighting?._id,
    type,
    title: isSighting ? `New sighting of ${pet.name}` : 'Lost pet near you',
    body: isSighting
      ? `${pet.name} was spotted in ${district}.`
      : `${pet.name} (${pet.breed || pet.species}) was reported in ${district}.`,
    photo: String(user._id) === String(pet.reportedBy) ? sighting?.photo || pet.photo || '' : pet.photo || '',
  }))

  await Notification.bulkWrite(
    documents.map((document) => ({
      updateOne: {
        filter: {
          user: document.user,
          pet: document.pet,
          type: document.type,
          sighting: document.sighting,
        },
        update: { $setOnInsert: document },
        upsert: true,
      },
    })),
  )
}

export async function listNotifications(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    let notifications
    try {
      notifications = await Notification.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .limit(50)
    } catch (error) {
      const unsupportedOrderByError =
        error?.code === 2 && String(error.message).includes('order-by item is excluded')
      if (!unsupportedOrderByError) throw error
      notifications = await Notification.find({ user: req.user._id })
      notifications.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      notifications = notifications.slice(0, 50)
    }

    res.json({ notifications: await serializeNotifications(notifications, req.user._id) })
  } catch (error) {
    next(error)
  }
}

export async function updatePreferences(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    const enabled = req.body?.enabled
    const radiusKm = Number(req.body?.radiusKm)
    const coordinates = req.body?.coordinates

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '`enabled` must be a boolean.' })
    }
    if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > MAX_ALERT_RADIUS_KM) {
      return res.status(400).json({ error: '`radiusKm` must be between 1 and 50.' })
    }
    if (coordinates !== undefined && !isPointCoordinates(coordinates)) {
      return res.status(400).json({ error: '`coordinates` must be [lng, lat].' })
    }

    req.user.alertsEnabled = enabled
    req.user.alertRadiusKm = radiusKm
    if (coordinates !== undefined) {
      req.user.alertLocation = { type: 'Point', coordinates: coordinates.map(Number) }
    }
    await req.user.save()

    res.json({
      preferences: {
        enabled: req.user.alertsEnabled,
        radiusKm: req.user.alertRadiusKm,
        coordinates: req.user.alertLocation?.coordinates,
      },
    })
  } catch (error) {
    next(error)
  }
}

export async function markAllRead(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    await Notification.updateMany({ user: req.user._id, read: false }, { $set: { read: true } })
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
}

export async function markRead(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid notification id' })
    }
    const filter = { _id: req.params.id, user: req.user._id }
    const notification = await Notification.findOne(filter)
    if (!notification) return res.status(404).json({ error: 'Notification not found' })
    const serialized = (await serializeNotifications([notification], req.user._id))[0]
    if (!serialized) return res.status(404).json({ error: 'Notification not found', code: 'NOTIFICATION_UNAVAILABLE' })
    const updated = await Notification.findOneAndUpdate(filter, { $set: { read: true } }, { new: true })
    if (!updated) return res.status(404).json({ error: 'Notification not found', code: 'NOTIFICATION_UNAVAILABLE' })
    res.json({ notification: { ...serialized, read: true } })
  } catch (error) {
    next(error)
  }
}
