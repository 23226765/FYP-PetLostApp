import mongoose from 'mongoose'
import Stray from '../models/Stray.js'

const MAX_PHOTO_LENGTH = 1_500_000
const PHONE_PATTERN = /^\+?[\d\s().-]{8,30}$/
const SPECIES = new Set(['Dog', 'Cat', 'Other'])
const CONDITIONS = new Set(['unknown', 'healthy', 'injured', 'critical'])
const RESCUE_STATUSES = new Set(['reported', 'rescue_dispatched', 'rescued'])
const HK_DISTRICTS = new Set([
  'Central and Western', 'Eastern', 'Southern', 'Wan Chai',
  'Kowloon City', 'Kwun Tong', 'Sham Shui Po', 'Wong Tai Sin', 'Yau Tsim Mong',
  'Islands', 'Kwai Tsing', 'North', 'Sai Kung', 'Sha Tin', 'Tai Po',
  'Tsuen Wan', 'Tuen Mun', 'Yuen Long',
])

function text(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function validCoordinates(value) {
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

function validPhone(value) {
  return PHONE_PATTERN.test(value) && value.replace(/\D/g, '').length >= 8
}

function relativeTime(date) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function serializeStray(stray, distanceMeters) {
  return {
    id: String(stray._id),
    species: stray.species,
    description: stray.description,
    photo: stray.photo || '',
    condition: stray.condition,
    district: stray.district,
    location: stray.locationName,
    coordinates: stray.location?.coordinates || null,
    rescueStatus: stray.rescueStatus,
    reporterName: stray.reporterName,
    reporterPhone: stray.reporterPhone,
    reportedBy: stray.reportedBy ? String(stray.reportedBy) : undefined,
    reportedAgo: relativeTime(stray.createdAt),
    createdAt: stray.createdAt,
    statusUpdatedAt: stray.statusUpdatedAt,
    distanceKm:
      typeof distanceMeters === 'number'
        ? Math.max(0.1, Math.round((distanceMeters / 1000) * 10) / 10)
        : undefined,
  }
}

function queryFilter(query) {
  const filter = {}
  if (query.species && SPECIES.has(query.species)) filter.species = query.species
  if (query.condition && CONDITIONS.has(query.condition)) filter.condition = query.condition
  if (query.status && RESCUE_STATUSES.has(query.status)) filter.rescueStatus = query.status
  if (query.district && HK_DISTRICTS.has(query.district)) filter.district = query.district
  return filter
}

async function findNewest(filter) {
  try {
    return await Stray.find(filter).sort({ createdAt: -1 })
  } catch (error) {
    const cosmosOrderByError =
      error?.code === 2 && String(error.message).includes('order-by item is excluded')
    if (!cosmosOrderByError) throw error
    const strays = await Stray.find(filter)
    return strays.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }
}

export async function listStrays(req, res, next) {
  try {
    const strays = await findNewest(queryFilter(req.query))
    res.json({ strays: strays.map((stray) => serializeStray(stray)) })
  } catch (error) {
    next(error)
  }
}

export async function listMyStrays(req, res, next) {
  try {
    const strays = await findNewest({ reportedBy: req.user._id })
    res.json({ strays: strays.map((stray) => serializeStray(stray)) })
  } catch (error) {
    next(error)
  }
}

export async function nearbyStrays(req, res, next) {
  try {
    const latitude = Number(req.query.lat)
    const longitude = Number(req.query.lng)
    const requestedRadius = Number(req.query.radiusKm)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ error: '`lat` and `lng` are required.' })
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Invalid coordinates.' })
    }
    const radiusKm = Number.isFinite(requestedRadius)
      ? Math.min(50, Math.max(1, requestedRadius))
      : 5
    const pipeline = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [longitude, latitude] },
          distanceField: 'distanceMeters',
          maxDistance: radiusKm * 1000,
          spherical: true,
          key: 'location',
        },
      },
    ]
    const filter = queryFilter(req.query)
    if (Object.keys(filter).length) pipeline.push({ $match: filter })
    pipeline.push({ $sort: { distanceMeters: 1 } })
    const strays = await Stray.aggregate(pipeline)
    res.json({ strays: strays.map((stray) => serializeStray(stray, stray.distanceMeters)) })
  } catch (error) {
    next(error)
  }
}

export async function getStray(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid stray report id' })
    }
    const stray = await Stray.findById(req.params.id)
    if (!stray) return res.status(404).json({ error: 'Stray report not found' })
    res.json({ stray: serializeStray(stray) })
  } catch (error) {
    next(error)
  }
}

export async function reportStray(req, res, next) {
  try {
    const { species, description, photo, condition, district, locationName, coordinates } = req.body
    const normalizedDescription = text(description, 2000)
    const normalizedDistrict = text(district, 80)
    const normalizedLocation = text(locationName, 200)
    const reporterName = text(req.user?.name || req.body.reporterName, 100)
    const reporterPhone = text(req.user?.phone || req.body.reporterPhone, 30)

    if (!SPECIES.has(species) || !normalizedDescription) {
      return res.status(400).json({ error: 'Species and description are required.' })
    }
    if (!CONDITIONS.has(condition || 'unknown')) {
      return res.status(400).json({ error: 'Invalid animal condition.' })
    }
    if (!HK_DISTRICTS.has(normalizedDistrict) || !normalizedLocation) {
      return res.status(400).json({ error: 'A valid district and location are required.' })
    }
    if (!validCoordinates(coordinates)) {
      return res.status(400).json({ error: '`coordinates` must be [lng, lat].' })
    }
    if (!reporterName || !validPhone(reporterPhone)) {
      return res.status(400).json({ error: 'A valid contact name and phone are required.' })
    }
    if (typeof photo === 'string' && photo.length > MAX_PHOTO_LENGTH) {
      return res.status(413).json({ error: 'Photo is too large. Choose a smaller image.' })
    }

    const stray = await Stray.create({
      species,
      description: normalizedDescription,
      photo: typeof photo === 'string' ? photo : '',
      condition: condition || 'unknown',
      district: normalizedDistrict,
      locationName: normalizedLocation,
      location: { type: 'Point', coordinates: coordinates.map(Number) },
      reporterName,
      reporterPhone,
      reportedBy: req.user?._id,
    })
    res.status(201).json({ stray: serializeStray(stray) })
  } catch (error) {
    next(error)
  }
}

export async function updateRescueStatus(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid stray report id' })
    }
    const status = req.body?.status
    if (!RESCUE_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid rescue status.' })
    }
    const stray = await Stray.findById(req.params.id)
    if (!stray) return res.status(404).json({ error: 'Stray report not found' })
    const isReporter = stray.reportedBy && String(stray.reportedBy) === String(req.user._id)
    if (!isReporter && req.user.role !== 'shelter_admin') {
      return res.status(403).json({ error: 'Only the reporter or a shelter admin can update this report.' })
    }
    stray.rescueStatus = status
    stray.statusUpdatedAt = new Date()
    await stray.save()
    res.json({ stray: serializeStray(stray) })
  } catch (error) {
    next(error)
  }
}
