import mongoose from 'mongoose'
import { anonymousSearchCoordinates, publicCellCentre, PUBLIC_GRID_SIZE_METERS, EARTH_RADIUS_METERS, MAX_MERCATOR_LATITUDE } from './locationPrivacy.js'
import { hotspotCandidateRadiusMeters, publicCellMembership, publicGridCellExpressions } from './hotspotAnalytics.js'
import { visibleContentFilter } from './moderationVisibility.js'
import { MAP_DISTRICTS, mapInsightFacets, publicMapInsights } from './mapInsights.js'

export const PET_MAP_QUERY_OPTIONS = Object.freeze({ maxTimeMS: 10000, allowDiskUse: false })
const DISTRICTS = new Set(MAP_DISTRICTS)
const invalid = () => Object.assign(new Error('Invalid map query.'), { status: 400, code: 'MAP_QUERY_INVALID' })
function number(value, fallback, min, max, integer = false) {
  if (value === undefined && fallback !== undefined) return fallback
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') throw invalid()
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) throw invalid()
  return parsed
}

export function parsePetMapQuery(query = {}, requester) {
  let area
  if (['west', 'south', 'east', 'north'].some(key => query[key] !== undefined)) {
    if (['lng', 'lat', 'radiusKm'].some(key => query[key] !== undefined)) throw invalid()
    const bounds = {
      west: number(query.west, undefined, -180, 180),
      south: number(query.south, undefined, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE),
      east: number(query.east, undefined, -180, 180),
      north: number(query.north, undefined, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE),
    }
    if (bounds.west >= bounds.east || bounds.south >= bounds.north) throw invalid()
    const projectedBounds = {
      west: EARTH_RADIUS_METERS * bounds.west * Math.PI / 180,
      east: EARTH_RADIUS_METERS * bounds.east * Math.PI / 180,
      south: EARTH_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + bounds.south * Math.PI / 360)),
      north: EARTH_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + bounds.north * Math.PI / 360)),
    }
    const longitude = (bounds.west + bounds.east) / 2
    const latitude = (2 * Math.atan(Math.exp((projectedBounds.south + projectedBounds.north) / 2 / EARTH_RADIUS_METERS)) - Math.PI / 2) * 180 / Math.PI
    // Mercator distances conservatively bound ground distances. Include every
    // exact point in an eligible public cell, including outside the viewport.
    // The shared padding also covers points beyond the polar grid clamp.
    const halfDiagonalKm = Math.hypot(projectedBounds.east - projectedBounds.west, projectedBounds.north - projectedBounds.south) / 2000
    const candidateRadiusMeters = hotspotCandidateRadiusMeters(latitude, halfDiagonalKm)
    if (candidateRadiusMeters > 50000) throw invalid()
    area = { longitude, latitude, bounds, projectedBounds, candidateRadiusMeters }
  } else {
    const lng = number(query.lng, undefined, -180, 180)
    const lat = number(query.lat, undefined, -90, 90)
    // All roles share the same public origin, not just guests.
    const [longitude, latitude] = anonymousSearchCoordinates(null, [lng, lat])
    const radiusKm = number(query.radiusKm, 20, 1, 50)
    area = { longitude, latitude, radiusKm }
  }
  const page = number(query.page, 1, 1, 10000, true)
  const limit = number(query.limit, 100, 1, 100, true)
  if (query.species !== undefined && !['Dog', 'Cat', 'Other'].includes(query.species)) throw invalid()
  if (query.district !== undefined && !DISTRICTS.has(query.district)) throw invalid()
  const id = requester?._id
  return { ...area, page, limit, species: query.species, district: query.district,
    ownerId: mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : null }
}

export function petMapPipeline(options, now = new Date()) {
  const { longitude, latitude, radiusKm, page, limit, ownerId, species, district, projectedBounds } = options
  const filter = visibleContentFilter({ status: { $in: ['lost', 'sighted'] } })
  if (ownerId) filter.reportedBy = { $ne: ownerId }
  if (species) filter.species = species
  if (district) filter.district = district
  return [
    { $geoNear: {
      near: { type: 'Point', coordinates: [((longitude + 180) % 360 + 360) % 360 - 180, latitude] },
      key: 'location', spherical: true, distanceField: 'internalDistance',
      maxDistance: options.candidateRadiusMeters ?? hotspotCandidateRadiusMeters(latitude, radiusKm), query: filter,
    } },
    // location remains the stored report point; never join or substitute sightings.
    { $project: { _id: 1, name: 1, species: 1, breed: 1, status: 1, district: 1, photo: 1, photos: 1,
      ...(options.bounds ? { createdAt: 1 } : {}),
      publicCell: publicGridCellExpressions() } },
    projectedBounds ? { $match: { $expr: { $and: [
      { $gte: [{ $multiply: [{ $add: ['$publicCell.x', 0.5] }, PUBLIC_GRID_SIZE_METERS] }, projectedBounds.west] },
      { $lte: [{ $multiply: [{ $add: ['$publicCell.x', 0.5] }, PUBLIC_GRID_SIZE_METERS] }, projectedBounds.east] },
      { $gte: [{ $multiply: [{ $add: ['$publicCell.y', 0.5] }, PUBLIC_GRID_SIZE_METERS] }, projectedBounds.south] },
      { $lte: [{ $multiply: [{ $add: ['$publicCell.y', 0.5] }, PUBLIC_GRID_SIZE_METERS] }, projectedBounds.north] },
    ] } } } : publicCellMembership(longitude, latitude, radiusKm, '$publicCell'),
    { $facet: {
      markers: [{ $sort: { _id: 1 } }, { $skip: (page - 1) * limit }, { $limit: limit }],
      totals: [{ $count: 'count' }],
      ...(options.bounds ? mapInsightFacets(now) : {}),
    } },
  ]
}

export function publicPetMapResult(result, { page, limit, radiusKm, bounds }, now = new Date()) {
  const markers = (result?.markers || []).map(pet => ({
    id: String(pet._id), name: pet.name, species: pet.species, breed: pet.breed || '',
    status: pet.status, district: DISTRICTS.has(pet.district) ? pet.district : '',
    photo: (typeof pet.photo === 'string' && pet.photo.trim()) ||
      (Array.isArray(pet.photos) ? pet.photos.find(photo => typeof photo === 'string' && photo.trim()) : '') || '',
    coordinates: publicCellCentre(pet.publicCell.x, pet.publicCell.y),
    locationPrecision: 'approximate', locationSource: 'stored_report',
  }))
  const total = result?.totals?.[0]?.count || 0
  return { markers, pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total },
    gridSizeMeters: PUBLIC_GRID_SIZE_METERS, ...(bounds ? { bounds, insights: publicMapInsights(result, now) } : { radiusKm }) }
}
