import mongoose from 'mongoose'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import { createRadiusNotifications } from './notificationController.js'

/* ───────────────────────── Helpers ───────────────────────── */

function isPoint(obj) {
  return (
    obj &&
    obj.type === 'Point' &&
    Array.isArray(obj.coordinates) &&
    obj.coordinates.length === 2 &&
    Number.isFinite(Number(obj.coordinates[0])) &&
    Number.isFinite(Number(obj.coordinates[1])) &&
    Number(obj.coordinates[0]) >= -180 &&
    Number(obj.coordinates[0]) <= 180 &&
    Number(obj.coordinates[1]) >= -90 &&
    Number(obj.coordinates[1]) <= 90
  )
}

const MAX_PHOTO_LENGTH = 1_500_000
const PHONE_PATTERN = /^\+?[\d\s().-]{8,30}$/
const HK_DISTRICTS = new Set([
  'Central and Western', 'Eastern', 'Southern', 'Wan Chai',
  'Kowloon City', 'Kwun Tong', 'Sham Shui Po', 'Wong Tai Sin', 'Yau Tsim Mong',
  'Islands', 'Kwai Tsing', 'North', 'Sai Kung', 'Sha Tin', 'Tai Po',
  'Tsuen Wan', 'Tuen Mun', 'Yuen Long',
])

function normalizedText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isValidPhone(value) {
  if (!PHONE_PATTERN.test(value)) return false
  const digitCount = value.replace(/\D/g, '').length
  return digitCount >= 8 && digitCount <= 15
}

function hasRequestBody(req) {
  return (
    req.body &&
    typeof req.body === 'object' &&
    !Array.isArray(req.body) &&
    Object.keys(req.body).length > 0
  )
}

function invalidRequestBody(res) {
  return res.status(400).json({
    success: false,
    message: 'Invalid or missing request body',
  })
}

function relativeDay(date) {
  const now = new Date()
  const then = new Date(date)
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const b = new Date(then.getFullYear(), then.getMonth(), then.getDate())
  const days = Math.round((a - b) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

function relativeTime(date) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

// Maps the DB document to the shape the Vue frontend already consumes.
function serializePet(pet, distanceMeters) {
  const distanceKm =
    typeof distanceMeters === 'number'
      ? Math.max(0.1, Math.round((distanceMeters / 1000) * 10) / 10)
      : undefined
  return {
    id: String(pet._id),
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    district: pet.district || '',
    photo: pet.photo,
    description: pet.description,
    details: pet.details || '',
    reward: pet.reward || undefined,
    owner: pet.ownerName,
    ownerPhone: pet.ownerPhone,
    reportedBy: pet.reportedBy ? String(pet.reportedBy) : undefined,
    status: pet.status,
    location: pet.locationName,
    distanceKm,
    lastSeen: pet.lastSeen ? relativeDay(pet.lastSeen) : '',
    postedAgo: pet.createdAt ? relativeTime(pet.createdAt) : '',
    mapX: pet.mapX,
    mapY: pet.mapY,
    coordinates: isPoint(pet.location) ? pet.location.coordinates : null,
  }
}

/* ───────────────────────── Routes ───────────────────────── */

// GET /api/pets
export async function listPets(req, res, next) {
  try {
    const { species, status, breed, district } = req.query
    if (district && !HK_DISTRICTS.has(normalizedText(district, 80))) {
      return res.status(400).json({ error: 'Invalid Hong Kong district.' })
    }
    const filter = {}
    if (species) filter.species = species
    if (status) filter.status = status
    if (breed) {
      filter.breed = { $regex: escapeRegex(normalizedText(breed, 120)), $options: 'i' }
    }
    if (district) filter.district = normalizedText(district, 80)
    let docs
    try {
      docs = await Pet.find(filter).sort({ createdAt: -1 })
    } catch (error) {
      const isCosmosOrderByIndexError =
        error?.code === 2 && String(error.message).includes('order-by item is excluded')
      if (!isCosmosOrderByIndexError) throw error
      docs = await Pet.find(filter)
      docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }
    res.json({ pets: docs.map((p) => serializePet(p)) })
  } catch (err) {
    next(err)
  }
}

// GET /api/pets/mine
export async function listMyPets(req, res, next) {
  try {
    let docs
    try {
      docs = await Pet.find({ reportedBy: req.user._id }).sort({ createdAt: -1 })
    } catch (error) {
      const isCosmosOrderByIndexError =
        error?.code === 2 && String(error.message).includes('order-by item is excluded')
      if (!isCosmosOrderByIndexError) throw error
      docs = await Pet.find({ reportedBy: req.user._id })
      docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }
    res.json({ pets: docs.map((pet) => serializePet(pet)) })
  } catch (err) {
    next(err)
  }
}

// GET /api/pets/sightings/mine
export async function listMySightings(req, res, next) {
  try {
    let sightings
    try {
      sightings = await Sighting.find({ reportedBy: req.user._id })
        .sort({ createdAt: -1 })
        .populate('pet', 'name photo status ownerPhone')
    } catch (error) {
      const isCosmosOrderByIndexError =
        error?.code === 2 && String(error.message).includes('order-by item is excluded')
      if (!isCosmosOrderByIndexError) throw error
      sightings = await Sighting.find({ reportedBy: req.user._id }).populate(
        'pet',
        'name photo status ownerPhone',
      )
      sightings.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    }
    res.json({ sightings })
  } catch (err) {
    next(err)
  }
}

// GET /api/pets/nearby?lat=&lng=&radiusKm=&species=&status=
export async function getNearbyPets(req, res, next) {
  try {
    const { lat, lng, radiusKm, species, status, breed, district } = req.query
    if (district && !HK_DISTRICTS.has(normalizedText(district, 80))) {
      return res.status(400).json({ error: 'Invalid Hong Kong district.' })
    }
    const latitude = Number(lat)
    const longitude = Number(lng)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ error: 'Query params `lat` and `lng` are required.' })
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Invalid coordinates.' })
    }
    const requestedRadius = Number(radiusKm)
    const normalizedRadius =
      Number.isFinite(requestedRadius) && requestedRadius > 0
        ? Math.min(requestedRadius, 50)
        : 3
    const radiusMeters = normalizedRadius * 1000

    const pipeline = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [longitude, latitude] },
          distanceField: 'distanceMeters',
          maxDistance: radiusMeters,
          spherical: true,
          key: 'location',
        },
      },
    ]
    const match = {}
    if (species) match.species = species
    if (status) match.status = status
    if (breed) {
      match.breed = { $regex: escapeRegex(normalizedText(breed, 120)), $options: 'i' }
    }
    if (district) match.district = normalizedText(district, 80)
    if (Object.keys(match).length) pipeline.push({ $match: match })
    pipeline.push({ $sort: { distanceMeters: 1 } })

    const docs = await Pet.aggregate(pipeline)
    res.json({ pets: docs.map((p) => serializePet(p, p.distanceMeters)) })
  } catch (err) {
    next(err)
  }
}

// GET /api/pets/:id
export async function getPet(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid pet id' })
    }
    const pet = await Pet.findById(req.params.id)
    if (!pet) return res.status(404).json({ error: 'Pet not found' })
    res.json({ pet: serializePet(pet) })
  } catch (err) {
    next(err)
  }
}

// GET /api/pets/:id/sightings
export async function listSightings(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid pet id' })
    }

    let docs
    try {
      docs = await Sighting.find({ pet: req.params.id }).sort({ createdAt: -1 })
    } catch (error) {
      const isCosmosOrderByIndexError =
        error?.code === 2 && String(error.message).includes('order-by item is excluded')
      if (!isCosmosOrderByIndexError) throw error

      docs = await Sighting.find({ pet: req.params.id })
      docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }
    const currentUserId = req.user?._id ? String(req.user._id) : null
    const sightings = docs.map((sighting) => {
      const confirmedBy = Array.isArray(sighting.confirmedBy) ? sighting.confirmedBy : []
      return {
        id: String(sighting._id),
        petId: String(sighting.pet),
        coordinates: sighting.location?.coordinates,
        locationName: sighting.locationName,
        note: sighting.note,
        photo: sighting.photo,
        createdAt: sighting.createdAt,
        confirmationCount: confirmedBy.length,
        confirmedByMe:
          Boolean(currentUserId) && confirmedBy.some((id) => String(id) === currentUserId),
      }
    })

    res.json({ sightings })
  } catch (err) {
    next(err)
  }
}

// POST /api/pets/:id/sightings/:sightingId/confirm
export async function confirmSighting(req, res, next) {
  try {
    const { id, sightingId } = req.params
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(sightingId)) {
      return res.status(400).json({ error: 'Invalid pet or sighting id' })
    }

    const sighting = await Sighting.findOneAndUpdate(
      { _id: sightingId, pet: id },
      { $addToSet: { confirmedBy: req.user._id } },
      { new: true },
    )
    if (!sighting) return res.status(404).json({ error: 'Sighting not found' })

    res.json({
      confirmationCount: sighting.confirmedBy?.length || 0,
      confirmedByMe: true,
    })
  } catch (err) {
    next(err)
  }
}

// POST /api/pets/report
export async function reportPet(req, res, next) {
  try {
    if (!hasRequestBody(req)) return invalidRequestBody(res)

    const {
      name, species, breed, district, photo, description, details, reward,
      ownerName, ownerPhone, locationName, coordinates, lastSeen, mapX, mapY,
    } = req.body

    const normalizedName = normalizedText(name, 100)
    const normalizedLocationName = normalizedText(locationName, 200)
    const normalizedDistrict = normalizedText(district, 80)
    if (!normalizedName || !['Dog', 'Cat', 'Other'].includes(species)) {
      return res.status(400).json({ error: '`name` and `species` are required.' })
    }
    if (!normalizedLocationName) {
      return res.status(400).json({ error: 'Last seen location is required.' })
    }
    if (!HK_DISTRICTS.has(normalizedDistrict)) {
      return res.status(400).json({ error: 'Select a valid Hong Kong district.' })
    }
    if (!isPoint({ type: 'Point', coordinates })) {
      return res.status(400).json({ error: '`coordinates` must be [lng, lat].' })
    }

    // Prefer the authenticated user's identity as the owner.
    const resolvedOwnerName = normalizedText(req.user?.name || ownerName, 100)
    const resolvedOwnerPhone = normalizedText(req.user?.phone || ownerPhone, 30)
    if (!resolvedOwnerName || !isValidPhone(resolvedOwnerPhone)) {
      return res.status(400).json({ error: 'A valid contact name and phone are required.' })
    }
    if (typeof photo === 'string' && photo.length > MAX_PHOTO_LENGTH) {
      return res.status(413).json({ error: 'Photo is too large. Choose a smaller image.' })
    }

    const pet = await Pet.create({
      name: normalizedName,
      species,
      breed: normalizedText(breed, 120),
      district: normalizedDistrict,
      photo: photo || '',
      description: normalizedText(description, 2000),
      details: normalizedText(details, 2000),
      reward: normalizedText(reward, 100),
      ownerName: resolvedOwnerName,
      ownerPhone: resolvedOwnerPhone,
      locationName: normalizedLocationName,
      location: { type: 'Point', coordinates: coordinates.map(Number) },
      lastSeen: lastSeen ? new Date(lastSeen) : new Date(),
      mapX: Number.isFinite(Number(mapX)) ? Number(mapX) : 50,
      mapY: Number.isFinite(Number(mapY)) ? Number(mapY) : 50,
      status: 'lost',
      reportedBy: req.user?._id || undefined,
    })

    try {
      await createRadiusNotifications({
        pet,
        type: 'proximity',
        origin: pet.location.coordinates,
        excludeUserId: req.user?._id,
      })
    } catch (notificationError) {
      console.error('Could not create proximity notifications:', notificationError)
    }

    res.status(201).json({ pet: serializePet(pet) })
  } catch (err) {
    next(err)
  }
}

// POST /api/pets/:id/sighting
export async function submitSighting(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid pet id' })
    }
    if (!hasRequestBody(req)) return invalidRequestBody(res)

    const pet = await Pet.findById(req.params.id)
    if (!pet) return res.status(404).json({ error: 'Pet not found' })

    const { coordinates, locationName, note, photo, reporterName, reporterPhone } = req.body
    if (!isPoint({ type: 'Point', coordinates })) {
      return res.status(400).json({ error: '`coordinates` must be [lng, lat].' })
    }
    if (typeof photo === 'string' && photo.length > MAX_PHOTO_LENGTH) {
      return res.status(413).json({ error: 'Photo is too large. Choose a smaller image.' })
    }

    const sighting = await Sighting.create({
      pet: pet._id,
      reportedBy: req.user?._id || undefined,
      location: { type: 'Point', coordinates: coordinates.map(Number) },
      locationName: normalizedText(locationName, 200),
      note: normalizedText(note, 2000),
      photo: photo || '',
      reporterName: normalizedText(reporterName, 100),
      reporterPhone: normalizedText(reporterPhone, 30),
    })

    pet.status = 'sighted'
    await pet.save()

    try {
      await createRadiusNotifications({
        pet,
        sighting,
        type: 'sighting',
        origin: sighting.location.coordinates,
        excludeUserId: req.user?._id,
      })
    } catch (notificationError) {
      console.error('Could not create sighting notifications:', notificationError)
    }

    res.status(201).json({
      sighting: {
        id: String(sighting._id),
        petId: String(pet._id),
        coordinates: sighting.location.coordinates,
        locationName: sighting.locationName,
        note: sighting.note,
        photo: sighting.photo || undefined,
        createdAt: sighting.createdAt,
        confirmationCount: 0,
        confirmedByMe: false,
      },
      pet: serializePet(pet),
    })
  } catch (err) {
    next(err)
  }
}

// PATCH /api/pets/:id/status
export async function updateStatus(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid pet id' })
    }
    if (!hasRequestBody(req)) return invalidRequestBody(res)

    const { status } = req.body
    if (!['lost', 'sighted', 'reunited'].includes(status)) {
      return res.status(400).json({ error: '`status` must be lost | sighted | reunited.' })
    }
    const existingPet = await Pet.findById(req.params.id).select('reportedBy')
    if (!existingPet) return res.status(404).json({ error: 'Pet not found' })
    if (!existingPet.reportedBy || String(existingPet.reportedBy) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Only the reporting owner can update this pet.' })
    }

    const pet = await Pet.findByIdAndUpdate(req.params.id, { status }, { new: true })
    if (!pet) return res.status(404).json({ error: 'Pet not found' })
    res.json({ pet: serializePet(pet) })
  } catch (err) {
    next(err)
  }
}
