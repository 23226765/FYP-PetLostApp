import mongoose from 'mongoose'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import { scoreCandidate } from '../services/matchEngine.js'
import {
  contactOwnerFrom,
  loadContactOwners,
  serializeContact,
} from '../services/contactPrivacy.js'
import { createRadiusNotifications } from './notificationController.js'
import { logServerError } from '../middleware/errorHandler.js'
import {
  anonymousSearchCoordinates,
  distanceBand,
  exactDistanceKm,
  MIN_ANONYMOUS_RADIUS_KM,
  projectPetLocation,
  projectedDistanceKm,
  projectSightingLocation,
  setLocationPrivacyHeaders,
} from '../services/locationPrivacy.js'
import { blockedUserIdsFor } from '../services/trustSafety.js'
import { visibleContentFilter } from '../services/moderationVisibility.js'

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

export function validateSightingLocation(location) {
  if (!location || typeof location !== 'object' || Array.isArray(location)) {
    return { error: 'A confirmed sighting location is required.' }
  }
  if (location.type !== 'Point') {
    return { error: '`location.type` must be exactly `Point`.' }
  }
  const coordinates = location.coordinates
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    return { error: '`location.coordinates` must contain [longitude, latitude].' }
  }
  if (
    coordinates.some(
      (coordinate) => typeof coordinate !== 'number' || !Number.isFinite(coordinate),
    )
  ) {
    return { error: 'Sighting coordinates must be finite numbers, not strings.' }
  }
  const [longitude, latitude] = coordinates
  if (longitude < -180 || longitude > 180) {
    return { error: 'Sighting longitude must be between -180 and 180.' }
  }
  if (latitude < -90 || latitude > 90) {
    return { error: 'Sighting latitude must be between -90 and 90.' }
  }
  return { coordinates: [longitude, latitude] }
}

function sightingTime(sighting) {
  const timestamp = new Date(sighting.sightedAt || sighting.createdAt).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

const MAX_PHOTO_LENGTH = 1_500_000
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100
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

function authenticatedUserObjectId(req) {
  const id = req.user?._id
  return mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : null
}

function excludeOwnedPets(filter, req) {
  const userId = authenticatedUserObjectId(req)
  if (userId) filter.reportedBy = { $ne: userId }
  return filter
}

function paginationFor(query) {
  const requestedPage = Number(query.page)
  const requestedLimit = Number(query.limit)
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const limit =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE
  return { page, limit, skip: (page - 1) * limit }
}

function paginationPayload(page, limit, total) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  }
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

function isSameSightingSubmission(sighting, pet, user) {
  const existingReporterId = sighting.reportedBy ? String(sighting.reportedBy) : ''
  const requestReporterId = user?._id ? String(user._id) : ''
  return (
    String(sighting.pet) === String(pet._id) && existingReporterId === requestReporterId
  )
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
function serializePet(
  pet,
  { distanceMeters, distanceOrigin, requester, contactOwner, forcePublic = false, blockedUserIds = new Set() } = {},
) {
  const location = projectPetLocation(pet, requester, { forcePublic })
  const distanceKm = location.locationPrecision === 'exact'
    ? exactDistanceKm(distanceMeters)
    : projectedDistanceKm(distanceOrigin, location.coordinates)
  const listedPhotos = Array.isArray(pet.photos)
    ? pet.photos.filter((photo) => typeof photo === 'string' && photo.trim())
    : []
  const primaryPhoto =
    (typeof pet.photo === 'string' && pet.photo.trim()) || listedPhotos[0] || ''
  const photos = primaryPhoto ? [...new Set([primaryPhoto, ...listedPhotos])] : []
  return {
    id: String(pet._id),
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    district: pet.district || '',
    photo: primaryPhoto,
    photos,
    description: pet.description,
    details: pet.details || '',
    reward: pet.reward || undefined,
    owner: pet.ownerName,
    ...serializeContact({
      requester: forcePublic ? null : requester,
      contactOwner,
      phoneField: 'ownerPhone',
      contextAllowed: !blockedUserIds.has(String(pet.reportedBy || '')),
    }),
    reportedBy: pet.reportedBy ? String(pet.reportedBy) : undefined,
    interactionBlocked: blockedUserIds.has(String(pet.reportedBy || '')),
    status: pet.status,
    location: location.location,
    locationPrecision: location.locationPrecision,
    distanceKm,
    lastSeen: pet.lastSeen ? relativeDay(pet.lastSeen) : '',
    postedAgo: pet.createdAt ? relativeTime(pet.createdAt) : '',
    lastSeenAt: pet.lastSeen ? new Date(pet.lastSeen).toISOString() : null,
    createdAt: pet.createdAt ? new Date(pet.createdAt).toISOString() : null,
    mapX: pet.mapX,
    mapY: pet.mapY,
    coordinates: location.coordinates,
  }
}

async function serializePetDocuments(
  pets,
  requester,
  distanceForPet,
  { includeContact = true, distanceOrigin, forcePublic = false } = {},
) {
  const owners = includeContact ? await loadContactOwners(pets) : new Map()
  const blockedUserIds = requester ? await blockedUserIdsFor(requester._id) : new Set()
  return pets.map((pet) =>
    serializePet(pet, {
      requester,
      contactOwner: includeContact ? contactOwnerFrom(owners, pet.reportedBy) : undefined,
      distanceMeters: distanceForPet?.(pet),
      distanceOrigin,
      forcePublic,
      blockedUserIds,
    }),
  )
}

async function serializeOnePet(pet, requester, distanceMeters, options = {}) {
  const owners = await loadContactOwners([pet])
  const blockedUserIds = requester ? await blockedUserIdsFor(requester._id) : new Set()
  return serializePet(pet, {
    requester,
    contactOwner: contactOwnerFrom(owners, pet.reportedBy),
    distanceMeters,
    blockedUserIds,
    ...options,
  })
}

function forcePublicProjection(req) {
  return req.query?.view === 'public'
}

/* ───────────────────────── Routes ───────────────────────── */

// GET /api/pets
export async function listPets(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    const { species, status, breed, district } = req.query
    if (district && !HK_DISTRICTS.has(normalizedText(district, 80))) {
      return res.status(400).json({ error: 'Invalid Hong Kong district.' })
    }
    const filter = excludeOwnedPets(visibleContentFilter(), req)
    if (species) filter.species = species
    if (status) filter.status = status
    if (breed) {
      filter.breed = { $regex: escapeRegex(normalizedText(breed, 120)), $options: 'i' }
    }
    if (district) filter.district = normalizedText(district, 80)
    const { page, limit, skip } = paginationFor(req.query)
    const total = await Pet.countDocuments(filter)
    let docs
    try {
      docs = await Pet.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit)
    } catch (error) {
      const isUnsupportedOrderByError =
        error?.code === 2 && String(error.message).includes('order-by item is excluded')
      if (!isUnsupportedOrderByError) throw error
      docs = await Pet.find(filter)
      docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      docs = docs.slice(skip, skip + limit)
    }
    res.json({
      pets: await serializePetDocuments(docs, req.user),
      pagination: paginationPayload(page, limit, total),
    })
  } catch (err) {
    next(err)
  }
}

// GET /api/pets/mine
export async function listMyPets(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    const { page, limit, skip } = paginationFor(req.query)
    const filter = visibleContentFilter({ reportedBy: req.user._id })
    const [total, reunited] = await Promise.all([
      Pet.countDocuments(filter),
      Pet.countDocuments({ ...filter, status: 'reunited' }),
    ])
    let docs
    try {
      docs = await Pet.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit)
    } catch (error) {
      const isUnsupportedOrderByError =
        error?.code === 2 && String(error.message).includes('order-by item is excluded')
      if (!isUnsupportedOrderByError) throw error
      docs = await Pet.find(filter)
      docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      docs = docs.slice(skip, skip + limit)
    }
    res.json({
      pets: await serializePetDocuments(docs, req.user, undefined, { includeContact: false }),
      pagination: paginationPayload(page, limit, total),
      summary: { total, reunited, active: total - reunited },
    })
  } catch (err) {
    next(err)
  }
}

// GET /api/pets/sightings/mine
export async function listMySightings(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    const queriedSightings = await Sighting.find(
      visibleContentFilter({ reportedBy: req.user._id }),
    ).populate({
      path: 'pet',
      match: visibleContentFilter(),
      select: 'name photo status ownerName reportedBy district',
    })
    const sightings = queriedSightings.filter((sighting) => Boolean(sighting.pet))
    sightings.sort(
      (left, right) =>
        sightingTime(right) - sightingTime(left) ||
        String(right._id).localeCompare(String(left._id)),
    )
    const petDocuments = sightings.map((sighting) => sighting.pet).filter(Boolean)
    const owners = await loadContactOwners(petDocuments)
    const blockedUserIds = await blockedUserIdsFor(req.user._id)
    res.json({
      sightings: sightings.map((sighting) => {
        const pet = sighting.pet
        const projectedLocation = projectSightingLocation(
          sighting,
          pet || {},
          req.user,
        )
        return {
          _id: String(sighting._id),
          pet: pet
            ? {
                _id: String(pet._id),
                name: pet.name,
                photo: pet.photo || '',
                status: pet.status,
                owner: pet.ownerName || 'Pet owner',
                reportedBy: pet.reportedBy ? String(pet.reportedBy) : undefined,
                ...serializeContact({
                  requester: req.user,
                  contactOwner: contactOwnerFrom(owners, pet.reportedBy),
                  phoneField: 'ownerPhone',
                  contextAllowed: !blockedUserIds.has(String(pet.reportedBy || '')),
                }),
              }
            : null,
          coordinates: projectedLocation.coordinates,
          locationName: projectedLocation.location,
          locationPrecision: projectedLocation.locationPrecision,
          note: sighting.note,
          photo: sighting.photo || undefined,
          sightedAt: sighting.sightedAt || sighting.createdAt,
          createdAt: sighting.createdAt,
        }
      }),
    })
  } catch (err) {
    next(err)
  }
}

// GET /api/pets/nearby?lat=&lng=&radiusKm=&species=&status=
export async function getNearbyPets(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
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
    const minimumRadius = req.user ? 0 : MIN_ANONYMOUS_RADIUS_KM
    const normalizedRadius =
      Number.isFinite(requestedRadius) && requestedRadius > 0
        ? Math.min(50, Math.max(minimumRadius, requestedRadius))
        : 3
    const radiusMeters = normalizedRadius * 1000
    const searchCoordinates = anonymousSearchCoordinates(req.user, [longitude, latitude])

    const { page, limit, skip } = paginationFor(req.query)
    const ownerId = authenticatedUserObjectId(req)
    const pipeline = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: searchCoordinates },
          distanceField: 'distanceMeters',
          maxDistance: radiusMeters,
          spherical: true,
          key: 'location',
          query: visibleContentFilter(
            ownerId ? { reportedBy: { $ne: ownerId } } : {},
          ),
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
    pipeline.push({
      $facet: {
        items: [
          { $sort: { distanceMeters: 1, _id: 1 } },
          { $skip: skip },
          { $limit: limit },
        ],
        totals: [{ $count: 'count' }],
      },
    })

    const [result] = await Pet.aggregate(pipeline)
    const docs = result?.items || []
    const total = result?.totals?.[0]?.count || 0
    res.json({
      pets: await serializePetDocuments(docs, req.user, (pet) => pet.distanceMeters, {
        distanceOrigin: searchCoordinates,
      }),
      pagination: paginationPayload(page, limit, total),
    })
  } catch (err) {
    next(err)
  }
}

// POST /api/pets/smart-match
export async function smartMatch(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    if (!hasRequestBody(req)) return invalidRequestBody(res)

    const { species, breed, coordinates, limit } = req.body
    const normalizedBreed = normalizedText(breed, 120)
    const parsedLimit = Number(limit)
    const resultLimit = Number.isFinite(parsedLimit)
      ? Math.min(50, Math.max(1, Math.floor(parsedLimit)))
      : 20

    if (!['Dog', 'Cat', 'Other'].includes(species)) {
      return res.status(400).json({
        success: false,
        message: '`species` must be Dog, Cat, or Other.',
      })
    }
    if (!isPoint({ type: 'Point', coordinates })) {
      return res.status(400).json({
        success: false,
        message: '`coordinates` must be [lng, lat].',
      })
    }

    // One pet query plus one grouped sighting query replaces the previous
    // client-side request-per-pet loop.
    const pets = await Pet.find(visibleContentFilter({
      species,
      status: { $in: ['lost', 'sighted'] },
    }))
    const petIds = pets.map((pet) => pet._id)
    const sightingCounts = new Map()

    if (petIds.length > 0) {
      try {
        const groups = await Sighting.aggregate([
          { $match: visibleContentFilter({ pet: { $in: petIds } }) },
          { $group: { _id: '$pet', count: { $sum: 1 } } },
        ])
        groups.forEach((group) => sightingCounts.set(String(group._id), group.count))
      } catch (error) {
        // Keep a single-query fallback for providers that reject grouping.
        // Counting still happens in memory without a client-side N+1 loop.
        const sightings = await Sighting.find(
          visibleContentFilter({ pet: { $in: petIds } }),
        ).select('pet')
        sightings.forEach((sighting) => {
          const petId = String(sighting.pet)
          sightingCounts.set(petId, (sightingCounts.get(petId) || 0) + 1)
        })
      }
    }

    const observation = {
      species,
      breed: normalizedBreed,
      coordinates: coordinates.map(Number),
    }
    const contactOwners = await loadContactOwners(pets)
    const blockedUserIds = req.user ? await blockedUserIdsFor(req.user._id) : new Set()
    const matches = pets
      .map((pet) => {
        const score = scoreCandidate(observation, pet)
        const internalDistanceKm = score.breakdown.distanceKm
        const { distanceKm: _privateDistanceKm, ...publicBreakdown } = score.breakdown
        return {
          internalDistanceKm,
          result: {
            ...serializePet(pet, {
              requester: req.user,
              contactOwner: contactOwnerFrom(contactOwners, pet.reportedBy),
              blockedUserIds,
            }),
            totalScore: score.totalScore,
            breakdown: {
              ...publicBreakdown,
              distanceBand: distanceBand(internalDistanceKm),
            },
            confidence: score.totalScore,
            sightingCount: sightingCounts.get(String(pet._id)) || 0,
          },
        }
      })
      .sort(
        (left, right) =>
          right.result.totalScore - left.result.totalScore ||
          (left.internalDistanceKm ?? Number.POSITIVE_INFINITY) -
            (right.internalDistanceKm ?? Number.POSITIVE_INFINITY),
      )
      .slice(0, resultLimit)
      .map(({ result }) => result)

    res.json({ matches })
  } catch (err) {
    next(err)
  }
}

// GET /api/pets/:id
export async function getPet(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid pet id' })
    }
    const pet = await Pet.findOne(visibleContentFilter({ _id: req.params.id }))
    if (!pet) return res.status(404).json({ error: 'Pet not found' })
    res.json({
      pet: await serializeOnePet(pet, req.user, undefined, {
        forcePublic: forcePublicProjection(req),
      }),
    })
  } catch (err) {
    next(err)
  }
}

// GET /api/pets/:id/sightings
export async function listSightings(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid pet id' })
    }

    const pet = await Pet.findOne(
      visibleContentFilter({ _id: req.params.id }),
    ).select('reportedBy district')
    if (!pet) return res.status(404).json({ error: 'Pet not found' })

    const docs = await Sighting.find(
      visibleContentFilter({ pet: req.params.id }),
    ).sort({ createdAt: 1, _id: 1 })
    const currentUserId = req.user?._id ? String(req.user._id) : null
    const ownerId = pet.reportedBy ? String(pet.reportedBy) : null
    const uniqueDocs = [
      ...new Map(docs.map((sighting) => [String(sighting._id), sighting])).values(),
    ].sort(
      (left, right) =>
        sightingTime(left) - sightingTime(right) ||
        String(left._id).localeCompare(String(right._id)),
    )
    const reporters = await loadContactOwners(uniqueDocs)
    const blockedUserIds = req.user ? await blockedUserIdsFor(req.user._id) : new Set()
    const sightings = uniqueDocs.map((sighting) => {
      const confirmedBy = Array.isArray(sighting.confirmedBy) ? sighting.confirmedBy : []
      const reporterId = sighting.reportedBy ? String(sighting.reportedBy) : null
      const canViewReporter = Boolean(
        currentUserId && (currentUserId === ownerId || currentUserId === reporterId),
      )
      const projectedLocation = projectSightingLocation(sighting, pet, req.user)
      const canViewContent = Boolean(currentUserId)
      const contactOwner = contactOwnerFrom(reporters, sighting.reportedBy)
      const serialized = {
        id: String(sighting._id),
        petId: String(sighting.pet),
        coordinates: projectedLocation.coordinates,
        locationName: projectedLocation.location,
        locationPrecision: projectedLocation.locationPrecision,
        sightedAt: sighting.sightedAt || sighting.createdAt,
        createdAt: sighting.createdAt,
        confirmationCount: confirmedBy.length,
        confirmedByMe:
          Boolean(currentUserId) && confirmedBy.some((id) => String(id) === currentUserId),
        ...serializeContact({
          requester: req.user,
          contactOwner,
          phoneField: 'reporterPhone',
          contextAllowed: canViewReporter && !blockedUserIds.has(String(sighting.reportedBy || '')),
        }),
      }
      if (canViewContent) {
        serialized.note = normalizedText(sighting.note, 2000)
        serialized.photo = typeof sighting.photo === 'string' ? sighting.photo : ''
      }
      if (canViewReporter) {
        serialized.reportedBy = reporterId || undefined
        serialized.reporterName = contactOwner?.name || sighting.reporterName || undefined
      }
      return serialized
    })

    res.json({ sightings, sightingCount: sightings.length })
  } catch (err) {
    next(err)
  }
}

// POST /api/pets/:id/sightings/:sightingId/confirm
export async function confirmSighting(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    const { id, sightingId } = req.params
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(sightingId)) {
      return res.status(400).json({ error: 'Invalid pet or sighting id' })
    }

    if (!await Pet.exists(visibleContentFilter({ _id: id }))) {
      return res.status(404).json({ error: 'Pet not found' })
    }

    const sighting = await Sighting.findOneAndUpdate(
      visibleContentFilter({ _id: sightingId, pet: id }),
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
    setLocationPrivacyHeaders(res)
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
      photos: photo ? [photo] : [],
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
      logServerError('Could not create proximity notifications', notificationError)
    }

    res.status(201).json({ pet: await serializeOnePet(pet, req.user) })
  } catch (err) {
    next(err)
  }
}

// POST /api/pets/:id/sighting
export async function submitSighting(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid pet id' })
    }
    if (!hasRequestBody(req)) return invalidRequestBody(res)

    const pet = await Pet.findOne(visibleContentFilter({ _id: req.params.id }))
    if (!pet) return res.status(404).json({ error: 'Pet not found' })
    if (pet.status === 'reunited') {
      return res.status(409).json({
        error: 'This pet has been reunited and no longer accepts sighting reports.',
      })
    }

    const {
      location,
      locationName,
      note,
      photo,
      reporterName,
      reporterPhone,
      submissionId,
    } = req.body
    const locationValidation = validateSightingLocation(location)
    if (locationValidation.error) {
      return res.status(400).json({ error: locationValidation.error })
    }
    const normalizedLocationName = normalizedText(locationName, 200)
    if (!normalizedLocationName) {
      return res.status(400).json({ error: '`locationName` is required.' })
    }
    if (typeof photo === 'string' && photo.length > MAX_PHOTO_LENGTH) {
      return res.status(413).json({ error: 'Photo is too large. Choose a smaller image.' })
    }
    const normalizedSubmissionId = normalizedText(submissionId, 128)
    if (
      submissionId !== undefined &&
      (!normalizedSubmissionId || !/^[A-Za-z0-9_-]{8,128}$/.test(normalizedSubmissionId))
    ) {
      return res.status(400).json({ error: '`submissionId` is invalid.' })
    }

    const sightingData = {
      pet: pet._id,
      reportedBy: req.user?._id || undefined,
      location: { type: 'Point', coordinates: locationValidation.coordinates },
      locationName: normalizedLocationName,
      note: normalizedText(note, 2000),
      photo: photo || '',
      reporterName: normalizedText(req.user?.name || reporterName, 100),
      reporterPhone: normalizedText(req.user?.phone || reporterPhone, 30),
      submissionId: normalizedSubmissionId || undefined,
      sightedAt: new Date(),
    }

    let sighting = null
    let created = true
    if (normalizedSubmissionId) {
      sighting = await Sighting.findOne(
        visibleContentFilter({ submissionId: normalizedSubmissionId }),
      ).select('+submissionId')
      if (sighting) {
        if (!isSameSightingSubmission(sighting, pet, req.user)) {
          return res.status(409).json({ error: 'This sighting submission identifier is in use.' })
        }
        created = false
      }
    }

    if (!sighting) {
      try {
        sighting = await Sighting.create(sightingData)
      } catch (error) {
        if (error?.code !== 11000 || !normalizedSubmissionId) throw error
        sighting = await Sighting.findOne(
          visibleContentFilter({ submissionId: normalizedSubmissionId }),
        ).select('+submissionId')
        if (!sighting) {
          return res.status(409).json({ error: 'This sighting submission is unavailable.' })
        }
        if (!isSameSightingSubmission(sighting, pet, req.user)) {
          return res.status(409).json({ error: 'This sighting submission identifier is in use.' })
        }
        created = false
      }
    }

    if (created) {
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
        logServerError('Could not create sighting notifications', notificationError)
      }
    }

    const projectedLocation = projectSightingLocation(sighting, pet, req.user)
    res.status(created ? 201 : 200).json({
      sighting: {
        id: String(sighting._id),
        petId: String(pet._id),
        coordinates: projectedLocation.coordinates,
        locationName: projectedLocation.location,
        locationPrecision: projectedLocation.locationPrecision,
        note: sighting.note,
        photo: sighting.photo || undefined,
        sightedAt: sighting.sightedAt || sighting.createdAt,
        createdAt: sighting.createdAt,
        confirmationCount: 0,
        confirmedByMe: false,
      },
      pet: await serializeOnePet(pet, req.user),
      duplicate: !created,
    })
  } catch (err) {
    next(err)
  }
}

// PATCH /api/pets/:id/status
export async function updateStatus(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid pet id' })
    }
    if (!hasRequestBody(req)) return invalidRequestBody(res)

    const { status } = req.body
    if (!['lost', 'sighted', 'reunited'].includes(status)) {
      return res.status(400).json({ error: '`status` must be lost | sighted | reunited.' })
    }
    const existingPet = await Pet.findOne(
      visibleContentFilter({ _id: req.params.id }),
    ).select('reportedBy')
    if (!existingPet) return res.status(404).json({ error: 'Pet not found' })
    if (!existingPet.reportedBy || String(existingPet.reportedBy) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Only the reporting owner can update this pet.' })
    }

    const pet = await Pet.findOneAndUpdate(
      visibleContentFilter({ _id: req.params.id }),
      { status },
      { new: true },
    )
    if (!pet) return res.status(404).json({ error: 'Pet not found' })
    res.json({ pet: await serializeOnePet(pet, req.user) })
  } catch (err) {
    next(err)
  }
}
