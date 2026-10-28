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

const CELL_SEARCH_PADDING_METERS = PUBLIC_GRID_SIZE_METERS / Math.SQRT2 + 1
const POLAR_CLAMP_PADDING_METERS = EARTH_RADIUS_METERS * (90 - MAX_MERCATOR_LATITUDE) * Math.PI / 180

// The indexed search must include every exact point whose PUBLIC cell is in
// range. Mercator does not enlarge ground distances within its latitude domain;
// beyond its clamp, include the full remaining poleward arc as well.
export function hotspotCandidateRadiusMeters(latitude, radiusKm) {
  const reachesClamp = Math.abs(latitude) +
    (radiusKm * 1000 + CELL_SEARCH_PADDING_METERS) / EARTH_RADIUS_METERS * 180 / Math.PI >= MAX_MERCATOR_LATITUDE
  return radiusKm * 1000 + CELL_SEARCH_PADDING_METERS + (reachesClamp ? POLAR_CLAMP_PADDING_METERS : 0)
}

export function publicCellMembership(longitude, latitude, radiusKm, cellPath = '$_id') {
  // Deterministic unrounded grid centres, independent of source coordinates.
  // Output uses the same centres rounded to six decimal places for display.
  const centreLng = { $divide: [{ $multiply: [{ $add: [`${cellPath}.x`, 0.5] }, PUBLIC_GRID_SIZE_METERS] }, EARTH_RADIUS_METERS] }
  const centreLat = { $subtract: [{ $multiply: [2, { $atan: { $exp: { $divide: [{ $multiply: [{ $add: [`${cellPath}.y`, 0.5] }, PUBLIC_GRID_SIZE_METERS] }, EARTH_RADIUS_METERS] } } }] }, Math.PI / 2] }
  const originLat = latitude * Math.PI / 180
  const sineSquared = (angle) => ({ $pow: [{ $sin: { $divide: [angle, 2] } }, 2] })
  const haversine = { $add: [
    sineSquared({ $subtract: [centreLat, originLat] }),
    { $multiply: [Math.cos(originLat), { $cos: centreLat }, sineSquared({ $subtract: [centreLng, longitude * Math.PI / 180] })] },
  ] }
  const distance = { $multiply: [2 * EARTH_RADIUS_METERS, { $asin: { $sqrt: { $max: [0, { $min: [1, haversine] }] } } }] }
  return { $match: { $expr: { $lte: [distance, radiusKm * 1000] } } }
}

// Shared deterministic grid math; callers must never serialize source points.
export function publicGridCellExpressions(coordinates = '$location.coordinates') {
  const lat = { $max: [-MAX_MERCATOR_LATITUDE, { $min: [MAX_MERCATOR_LATITUDE, { $arrayElemAt: [coordinates, 1] }] }] }
  return {
    x: { $floor: { $divide: [{ $multiply: [EARTH_RADIUS_METERS, { $divide: [{ $multiply: [{ $arrayElemAt: [coordinates, 0] }, Math.PI] }, 180] }] }, PUBLIC_GRID_SIZE_METERS] } },
    y: { $floor: { $divide: [{ $multiply: [EARTH_RADIUS_METERS, { $ln: { $tan: { $add: [Math.PI / 4, { $divide: [{ $multiply: [lat, Math.PI] }, 360] }] } } }] }, PUBLIC_GRID_SIZE_METERS] } },
  }
}

// Visibility/time filters precede grouping; final public radius membership
// follows it. No source-record limit or sample is permitted.
function sourcePipeline(source, { longitude, latitude, radiusKm, since, windowDays, now }) {
  const isSighting = source === 'sightings'
  const pipeline = [{ $geoNear: {
    // A cell centre at the antimeridian may project just outside [-180, 180].
    near: { type: 'Point', coordinates: [((longitude + 180) % 360 + 360) % 360 - 180, latitude] },
    distanceField: 'distanceMeters', maxDistance: hotspotCandidateRadiusMeters(latitude, radiusKm),
    spherical: true, key: 'location',
    query: visibleContentFilter({ createdAt: { $gte: since }, ...(!isSighting ? { active: { $ne: false } } : {}) }),
  } }]
  if (isSighting) pipeline.push(
    { $lookup: { from: 'pets', localField: 'pet', foreignField: '_id', as: 'parentPet' } },
    { $match: { 'parentPet.0': { $exists: true }, 'parentPet.moderationStatus': { $ne: 'hidden' } } },
  )
  const grid = publicGridCellExpressions()
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
      cellX: grid.x,
      cellY: grid.y,
      // Nonnegative Math.round parity, not MongoDB's ties-to-even $round.
      weightUnits: { $floor: { $add: [{ $multiply: [weight, 100] }, 0.5] } },
    } },
    { $group: { _id: { x: '$cellX', y: '$cellY' }, count: { $sum: 1 }, weightUnits: { $sum: '$weightUnits' } } },
    publicCellMembership(longitude, latitude, radiusKm),
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
