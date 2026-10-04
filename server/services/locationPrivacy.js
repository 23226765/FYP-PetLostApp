const EARTH_RADIUS_METERS = 6_378_137
const MAX_MERCATOR_LATITUDE = 85.05112878

export const PUBLIC_GRID_SIZE_METERS = 750
export const MIN_ANONYMOUS_RADIUS_KM = 1

function finiteCoordinates(value) {
  if (!Array.isArray(value) || value.length !== 2) return null
  const coordinates = value.map(Number)
  if (
    !coordinates.every(Number.isFinite) ||
    coordinates[0] < -180 ||
    coordinates[0] > 180 ||
    coordinates[1] < -90 ||
    coordinates[1] > 90
  ) {
    return null
  }
  return coordinates
}

export function normalizedId(value) {
  const id = value?._id ?? value?.id ?? value
  return id === undefined || id === null ? '' : String(id)
}

export function sameId(left, right) {
  const leftId = normalizedId(left)
  const rightId = normalizedId(right)
  return Boolean(leftId && rightId && leftId === rightId)
}

/**
 * Convert an exact [longitude, latitude] point to the deterministic centre of
 * its 750 metre Web Mercator grid cell. This is stable across requests and
 * intentionally cannot be reversed to the source point.
 */
export function approximateCoordinates(value, gridSizeMeters = PUBLIC_GRID_SIZE_METERS) {
  const coordinates = finiteCoordinates(value)
  if (!coordinates) return null

  const [longitude, rawLatitude] = coordinates
  const latitude = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, rawLatitude))
  const x = EARTH_RADIUS_METERS * (longitude * Math.PI / 180)
  const y = EARTH_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI / 360)))
  const cellX = Math.floor(x / gridSizeMeters)
  const cellY = Math.floor(y / gridSizeMeters)
  const centreX = (cellX + 0.5) * gridSizeMeters
  const centreY = (cellY + 0.5) * gridSizeMeters
  const projectedLongitude = centreX / EARTH_RADIUS_METERS * 180 / Math.PI
  const projectedLatitude = (2 * Math.atan(Math.exp(centreY / EARTH_RADIUS_METERS)) - Math.PI / 2) * 180 / Math.PI

  return [
    Number(projectedLongitude.toFixed(6)),
    Number(projectedLatitude.toFixed(6)),
  ]
}

export function anonymousSearchCoordinates(requester, value) {
  const coordinates = finiteCoordinates(value)
  if (!coordinates) return null
  return requester ? coordinates : approximateCoordinates(coordinates)
}

export function canViewExactPetLocation(requester, pet, { forcePublic = false } = {}) {
  return !forcePublic && sameId(requester, pet?.reportedBy)
}

export function canViewExactSightingLocation(
  requester,
  pet,
  sighting,
  { forcePublic = false } = {},
) {
  if (forcePublic) return false
  return sameId(requester, pet?.reportedBy) || sameId(requester, sighting?.reportedBy)
}

export function canViewExactStrayLocation(requester, stray, { forcePublic = false } = {}) {
  return !forcePublic && sameId(requester, stray?.reportedBy)
}

function safeDistrict(value) {
  return typeof value === 'string' ? value.trim().slice(0, 80) : ''
}

function exactLocationLabel(value, district) {
  const label = typeof value === 'string' ? value.trim().slice(0, 200) : ''
  return label || safeDistrict(district)
}

function projectLocation({ coordinates, district, exactLabel, exact }) {
  const normalizedCoordinates = finiteCoordinates(coordinates)
  return {
    location: exact ? exactLocationLabel(exactLabel, district) : safeDistrict(district),
    locationPrecision: exact ? 'exact' : 'approximate',
    coordinates: exact
      ? normalizedCoordinates
      : approximateCoordinates(normalizedCoordinates),
  }
}

export function projectPetLocation(pet, requester, options = {}) {
  return projectLocation({
    coordinates: pet?.location?.coordinates,
    district: pet?.district,
    exactLabel: pet?.locationName,
    exact: canViewExactPetLocation(requester, pet, options),
  })
}

export function projectSightingLocation(sighting, pet, requester, options = {}) {
  return projectLocation({
    coordinates: sighting?.location?.coordinates,
    district: pet?.district,
    exactLabel: sighting?.locationName,
    exact: canViewExactSightingLocation(requester, pet, sighting, options),
  })
}

export function projectStrayLocation(stray, requester, options = {}) {
  return projectLocation({
    coordinates: stray?.location?.coordinates,
    district: stray?.district,
    exactLabel: stray?.locationName,
    exact: canViewExactStrayLocation(requester, stray, options),
  })
}

export function haversineDistanceKm(left, right) {
  const origin = finiteCoordinates(left)
  const destination = finiteCoordinates(right)
  if (!origin || !destination) return null

  const toRadians = (degrees) => degrees * Math.PI / 180
  const [leftLng, leftLat] = origin
  const [rightLng, rightLat] = destination
  const latitudeDelta = toRadians(rightLat - leftLat)
  const longitudeDelta = toRadians(rightLng - leftLng)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(leftLat)) *
      Math.cos(toRadians(rightLat)) *
      Math.sin(longitudeDelta / 2) ** 2
  return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(haversine)))
}

export function projectedDistanceKm(origin, projectedCoordinates) {
  const distance = haversineDistanceKm(origin, projectedCoordinates)
  if (!Number.isFinite(distance)) return undefined
  return Math.max(0.5, Math.round(distance * 2) / 2)
}

export function exactDistanceKm(distanceMeters) {
  return typeof distanceMeters === 'number' && Number.isFinite(distanceMeters)
    ? Math.max(0.1, Math.round((distanceMeters / 1000) * 10) / 10)
    : undefined
}

export function distanceBand(distanceKm) {
  if (!Number.isFinite(distanceKm)) return 'unknown'
  if (distanceKm <= 1) return 'within_1_km'
  if (distanceKm <= 3) return '1_to_3_km'
  if (distanceKm <= 5) return '3_to_5_km'
  return 'over_5_km'
}

export function setLocationPrivacyHeaders(res) {
  if (typeof res?.set !== 'function') return
  res.set('Cache-Control', 'private, no-store, max-age=0')
  res.set('Vary', 'Authorization')
}
