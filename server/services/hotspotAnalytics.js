import { approximateCoordinates, publicCellCentre, EARTH_RADIUS_METERS, MAX_MERCATOR_LATITUDE, PUBLIC_GRID_SIZE_METERS } from './locationPrivacy.js'
import { visibleContentFilter } from './moderationVisibility.js'

const DAY_MS = 24 * 60 * 60 * 1000
export const MAX_HOTSPOT_CELLS = 1500
export const HOTSPOT_QUERY_OPTIONS = Object.freeze({ maxTimeMS: 10000, allowDiskUse: false })

function clamp(value, minimum = 0.1, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value))
}

function rounded(value) {
  return Math.round(value * 100) / 100
}

function coordinatesOf(document) {
  const coordinates = document?.location?.coordinates
  return Array.isArray(coordinates) && coordinates.length === 2
    ? coordinates.map(Number)
    : null
}

export function recencyFactor(createdAt, windowDays, now = new Date()) {
  const timestamp = new Date(createdAt).getTime()
  const reference = new Date(now).getTime()
  if (!Number.isFinite(timestamp) || !Number.isFinite(reference) || windowDays <= 0) return 0

  const ageDays = Math.max(0, (reference - timestamp) / DAY_MS)
  return clamp(1 - ageDays / windowDays, 0, 1)
}

export function sightingIntensity(sighting, windowDays, now = new Date()) {
  const confirmationCount = Array.isArray(sighting.confirmedBy)
    ? sighting.confirmedBy.length
    : Number(sighting.confirmationCount) || 0
  const credibility = 0.55 + Math.min(4, Math.max(0, confirmationCount)) * 0.08
  const recency = 0.65 + recencyFactor(sighting.createdAt, windowDays, now) * 0.35
  return rounded(clamp(credibility * recency))
}

export function strayIntensity(stray, windowDays, now = new Date()) {
  const urgency = {
    healthy: 0.4,
    unknown: 0.58,
    injured: 0.85,
    critical: 1,
  }[stray.condition] ?? 0.5
  const statusFactor = {
    reported: 1,
    rescue_dispatched: 0.8,
    rescued: 0.5,
  }[stray.rescueStatus] ?? 1
  const recency = 0.65 + recencyFactor(stray.createdAt, windowDays, now) * 0.35
  return rounded(clamp(urgency * statusFactor * recency))
}

function cellIntensity(weight) {
  if (!Number.isFinite(weight) || weight <= 0) return 0.1
  return rounded(clamp(1 - Math.exp(-weight / 2)))
}

/**
 * Groups exact internal records into deterministic public 750 metre cells.
 * Only cell centres and aggregate counts leave this service; source IDs,
 * timestamps, and exact coordinates are intentionally not copied.
 */
export function aggregateHotspotCells(
  { sightings = [], strays = [] },
  windowDays,
  now = new Date(),
) {
  const cells = new Map()

  function add(document, source, weight) {
    const coordinates = approximateCoordinates(coordinatesOf(document))
    if (!coordinates) return
    const key = coordinates.join(',')
    const cell = cells.get(key) || {
      coordinates,
      locationPrecision: 'approximate',
      count: 0,
      sightingCount: 0,
      strayCount: 0,
      weight: 0,
    }
    cell.count += 1
    cell.weight += weight
    if (source === 'sighting') cell.sightingCount += 1
    if (source === 'stray') cell.strayCount += 1
    cells.set(key, cell)
  }

  sightings.forEach((sighting) => {
    add(sighting, 'sighting', sightingIntensity(sighting, windowDays, now))
  })
  strays.forEach((stray) => {
    add(stray, 'stray', strayIntensity(stray, windowDays, now))
  })

  return [...cells.values()]
    .map(({ weight, ...cell }) => ({ ...cell, intensity: cellIntensity(weight) }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.coordinates[0] - right.coordinates[0] ||
        left.coordinates[1] - right.coordinates[1],
    )
}

export { PUBLIC_GRID_SIZE_METERS }

// All filters precede grouping; no source-record limit or sample is permitted.
function sourcePipeline(source, { longitude, latitude, radiusKm, since, windowDays, now }) {
  const isSighting = source === 'sightings'
  const pipeline = [{ $geoNear: {
    near: { type: 'Point', coordinates: [longitude, latitude] },
    distanceField: 'distanceMeters', maxDistance: radiusKm * 1000,
    spherical: true, key: 'location',
    query: visibleContentFilter({ createdAt: { $gte: since }, ...(!isSighting ? { active: { $ne: false } } : {}) }),
  } }]
  if (isSighting) pipeline.push(
    { $lookup: { from: 'pets', localField: 'pet', foreignField: '_id', as: 'parentPet' } },
    { $match: { 'parentPet.0': { $exists: true }, 'parentPet.moderationStatus': { $ne: 'hidden' } } },
  )
  const lat = { $max: [-MAX_MERCATOR_LATITUDE, { $min: [MAX_MERCATOR_LATITUDE, { $arrayElemAt: ['$location.coordinates', 1] }] }] }
  const recency = { $max: [0, { $min: [1, { $subtract: [1, { $divide: [{ $divide: [{ $max: [0, { $subtract: [now, '$createdAt'] }] }, DAY_MS] }, windowDays] }] }] }] }
  const factor = isSighting
    ? { $add: [0.55, { $multiply: [0.08, { $min: [4, { $cond: [{ $isArray: '$confirmedBy' }, { $size: '$confirmedBy' }, 0] }] }] }] }
    : { $multiply: [
      { $switch: { branches: Object.entries({ healthy: 0.4, unknown: 0.58, injured: 0.85, critical: 1 }).map(([key, value]) => ({ case: { $eq: ['$condition', key] }, then: value })), default: 0.5 } },
      { $switch: { branches: Object.entries({ reported: 1, rescue_dispatched: 0.8, rescued: 0.5 }).map(([key, value]) => ({ case: { $eq: ['$rescueStatus', key] }, then: value })), default: 1 } },
    ] }
  const weight = { $max: [0.1, { $min: [1, { $multiply: [factor, { $add: [0.65, { $multiply: [recency, 0.35] }] }] }] }] }
  pipeline.push(
    { $project: {
      _id: 0,
      cellX: { $floor: { $divide: [{ $multiply: [EARTH_RADIUS_METERS, { $divide: [{ $multiply: [{ $arrayElemAt: ['$location.coordinates', 0] }, Math.PI] }, 180] }] }, PUBLIC_GRID_SIZE_METERS] } },
      cellY: { $floor: { $divide: [{ $multiply: [EARTH_RADIUS_METERS, { $ln: { $tan: { $add: [Math.PI / 4, { $divide: [{ $multiply: [lat, Math.PI] }, 360] }] } } }] }, PUBLIC_GRID_SIZE_METERS] } },
      // Nonnegative Math.round parity, not MongoDB's ties-to-even $round.
      weightUnits: { $floor: { $add: [{ $multiply: [weight, 100] }, 0.5] } },
    } },
    { $group: { _id: { x: '$cellX', y: '$cellY' }, count: { $sum: 1 }, weightUnits: { $sum: '$weightUnits' } } },
    { $project: { _id: 1, count: 1, weightUnits: 1, sightingCount: isSighting ? '$count' : { $literal: 0 }, strayCount: isSighting ? { $literal: 0 } : '$count' } },
  )
  return pipeline
}

export function hotspotPipeline(source, options) {
  const pipeline = sourcePipeline(source === 'strays' ? 'strays' : 'sightings', options)
  if (source === 'all') pipeline.push({ $unionWith: { coll: 'strays', pipeline: sourcePipeline('strays', options) } })
  pipeline.push(
    { $group: { _id: '$_id', count: { $sum: '$count' }, sightingCount: { $sum: '$sightingCount' }, strayCount: { $sum: '$strayCount' }, weightUnits: { $sum: '$weightUnits' } } },
    { $facet: {
      cells: [{ $sort: { count: -1, '_id.x': 1, '_id.y': 1 } }, { $limit: MAX_HOTSPOT_CELLS }],
      summary: [{ $group: { _id: null, total: { $sum: '$count' }, sightings: { $sum: '$sightingCount' }, strays: { $sum: '$strayCount' }, cellCount: { $sum: 1 } } }, { $project: { _id: 0 } }],
    } },
  )
  return pipeline
}

export function publicHotspotResult(result) {
  const cells = (result?.cells || []).map((cell) => ({
    coordinates: publicCellCentre(cell._id.x, cell._id.y), locationPrecision: 'approximate',
    count: cell.count, sightingCount: cell.sightingCount, strayCount: cell.strayCount,
    intensity: cellIntensity(cell.weightUnits / 100),
  }))
  const counts = result?.summary?.[0] || { total: 0, cellCount: 0, sightings: 0, strays: 0 }
  return { cells, summary: {
    total: counts.total, cellCount: counts.cellCount, sightings: counts.sightings, strays: counts.strays,
    returnedCellCount: cells.length, returnedTotal: cells.reduce((total, cell) => total + cell.count, 0),
    cellsTruncated: counts.cellCount > cells.length, maxCells: MAX_HOTSPOT_CELLS,
  } }
}
