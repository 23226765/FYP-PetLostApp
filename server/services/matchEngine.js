const EARTH_RADIUS_KM = 6371.0088
const MAX_BREED_POINTS = 25

function round(value, precision = 2) {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function normalizeBreed(value) {
  return typeof value === 'string'
    ? value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    : ''
}

function breedTokens(value) {
  return [...new Set(normalizeBreed(value).split(' ').filter(Boolean))]
}

export function levenshteinDistance(leftValue, rightValue) {
  const left = normalizeBreed(leftValue)
  const right = normalizeBreed(rightValue)

  if (!left.length) return right.length
  if (!right.length) return left.length

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      )
    }
    previous = current
  }

  return previous[right.length]
}

export function breedSimilarity(observedBreed, candidateBreed) {
  const observed = normalizeBreed(observedBreed)
  const candidate = normalizeBreed(candidateBreed)
  if (!observed || !candidate) return 0
  if (observed === candidate) return 1

  const observedTokens = breedTokens(observed)
  const candidateTokens = breedTokens(candidate)
  const candidateSet = new Set(candidateTokens)
  const overlap = observedTokens.filter((token) => candidateSet.has(token)).length
  const tokenSimilarity =
    observedTokens.length + candidateTokens.length > 0
      ? (2 * overlap) / (observedTokens.length + candidateTokens.length)
      : 0

  const editDistance = levenshteinDistance(observed, candidate)
  const levenshteinSimilarity = 1 - editDistance / Math.max(observed.length, candidate.length)

  return Math.max(0, Math.min(1, Math.max(tokenSimilarity, levenshteinSimilarity)))
}

export function haversineDistanceKm(originCoordinates, candidateCoordinates) {
  if (
    !Array.isArray(originCoordinates) ||
    !Array.isArray(candidateCoordinates) ||
    originCoordinates.length !== 2 ||
    candidateCoordinates.length !== 2
  ) {
    return Number.POSITIVE_INFINITY
  }

  const [originLng, originLat] = originCoordinates.map(Number)
  const [candidateLng, candidateLat] = candidateCoordinates.map(Number)
  if (
    ![originLng, originLat, candidateLng, candidateLat].every(Number.isFinite) ||
    Math.abs(originLng) > 180 ||
    Math.abs(candidateLng) > 180 ||
    Math.abs(originLat) > 90 ||
    Math.abs(candidateLat) > 90
  ) {
    return Number.POSITIVE_INFINITY
  }

  const toRadians = (degrees) => (degrees * Math.PI) / 180
  const latitudeDelta = toRadians(candidateLat - originLat)
  const longitudeDelta = toRadians(candidateLng - originLng)
  const originLatitude = toRadians(originLat)
  const candidateLatitude = toRadians(candidateLat)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(candidateLatitude) *
      Math.sin(longitudeDelta / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(haversine)))
}

export function distanceScore(distanceKm) {
  if (!Number.isFinite(distanceKm) || distanceKm > 5) return 0
  if (distanceKm <= 1) return 25
  return 25 * (1 - (distanceKm - 1) / 4)
}

export function recencyScore(daysAgo) {
  if (!Number.isFinite(daysAgo)) return 0
  if (daysAgo <= 1) return 20
  if (daysAgo <= 7) return 12
  if (daysAgo <= 14) return 5
  return 0
}

export function scoreCandidate(observation, candidate, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date()
  const speciesPoints =
    typeof observation?.species === 'string' &&
    typeof candidate?.species === 'string' &&
    observation.species.toLowerCase() === candidate.species.toLowerCase()
      ? 30
      : 0

  const breedPoints = MAX_BREED_POINTS * breedSimilarity(observation?.breed, candidate?.breed)
  const candidateCoordinates = candidate?.location?.coordinates ?? candidate?.coordinates
  const rawDistanceKm = haversineDistanceKm(observation?.coordinates, candidateCoordinates)
  const rawCreatedAt = new Date(candidate?.createdAt).getTime()
  const daysAgo = Number.isFinite(rawCreatedAt)
    ? Math.max(0, (now.getTime() - rawCreatedAt) / 86_400_000)
    : Number.POSITIVE_INFINITY

  const breakdown = {
    species: speciesPoints,
    breed: round(breedPoints),
    distance: round(distanceScore(rawDistanceKm)),
    recency: recencyScore(daysAgo),
    distanceKm: Number.isFinite(rawDistanceKm) ? round(rawDistanceKm) : null,
    daysAgo: Number.isFinite(daysAgo) ? round(daysAgo, 1) : null,
  }

  return {
    totalScore: round(
      breakdown.species + breakdown.breed + breakdown.distance + breakdown.recency,
    ),
    breakdown,
  }
}
