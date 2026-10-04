import { approximateCoordinates, PUBLIC_GRID_SIZE_METERS } from './locationPrivacy.js'

const DAY_MS = 24 * 60 * 60 * 1000

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
