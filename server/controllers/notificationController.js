import mongoose from 'mongoose'
import Notification from '../models/Notification.js'
import User from '../models/User.js'

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

function serializeNotification(notification) {
  return {
    id: String(notification._id),
    type: notification.type,
    title: notification.title,
    body: notification.body,
    photo: notification.photo || undefined,
    petId: String(notification.pet?._id || notification.pet),
    time: relativeTime(notification.createdAt),
    read: Boolean(notification.read),
  }
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
    // Some Cosmos configurations reject geo aggregation until the new index is
    // available. This produces the same result while keeping delivery working.
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
  if (!pet?._id || !isPointCoordinates(origin)) return

  const recipients = await findAlertRecipients(origin.map(Number), excludeUserId)
  const recipientsById = new Map(recipients.map((user) => [String(user._id), user]))

  if (type === 'sighting' && pet.reportedBy && String(pet.reportedBy) !== String(excludeUserId)) {
    recipientsById.set(String(pet.reportedBy), { _id: pet.reportedBy })
  }
  if (recipientsById.size === 0) return

  const isSighting = type === 'sighting'
  const locationName = sighting?.locationName || pet.locationName || 'the reported location'
  const documents = [...recipientsById.values()].map((user) => ({
    user: user._id,
    pet: pet._id,
    sighting: sighting?._id,
    type,
    title: isSighting ? `New sighting of ${pet.name}` : 'Lost pet near you',
    body: isSighting
      ? `${pet.name} was spotted near ${locationName}.`
      : `${pet.name} (${pet.breed || pet.species}) was reported near ${locationName}.`,
    photo: sighting?.photo || pet.photo || '',
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
    let notifications
    try {
      notifications = await Notification.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .limit(50)
    } catch (error) {
      const cosmosOrderByError =
        error?.code === 2 && String(error.message).includes('order-by item is excluded')
      if (!cosmosOrderByError) throw error
      notifications = await Notification.find({ user: req.user._id })
      notifications.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      notifications = notifications.slice(0, 50)
    }

    res.json({ notifications: notifications.map(serializeNotification) })
  } catch (error) {
    next(error)
  }
}

export async function updatePreferences(req, res, next) {
  try {
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
    await Notification.updateMany({ user: req.user._id, read: false }, { $set: { read: true } })
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
}

export async function markRead(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid notification id' })
    }
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: { read: true } },
      { new: true },
    )
    if (!notification) return res.status(404).json({ error: 'Notification not found' })
    res.json({ notification: serializeNotification(notification) })
  } catch (error) {
    next(error)
  }
}
