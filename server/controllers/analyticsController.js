import Sighting from '../models/Sighting.js'
import Stray from '../models/Stray.js'
import { sightingIntensity, strayIntensity } from '../services/hotspotAnalytics.js'

const SOURCES = new Set(['all', 'sightings', 'strays'])
const MAX_POINTS_PER_SOURCE = 750

function validCoordinate(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum
}

function geoPipeline(longitude, latitude, radiusKm, since, projection) {
  return [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [longitude, latitude] },
        distanceField: 'distanceMeters',
        maxDistance: radiusKm * 1000,
        spherical: true,
        key: 'location',
      },
    },
    { $match: { createdAt: { $gte: since } } },
    { $limit: MAX_POINTS_PER_SOURCE },
    { $project: projection },
  ]
}

function coordinatesOf(document) {
  const coordinates = document.location?.coordinates
  return Array.isArray(coordinates) && coordinates.length === 2
    ? coordinates.map(Number)
    : null
}

// GET /api/analytics/hotspots
export async function listHotspots(req, res, next) {
  try {
    const latitude = Number(req.query.lat)
    const longitude = Number(req.query.lng)
    if (!validCoordinate(latitude, -90, 90) || !validCoordinate(longitude, -180, 180)) {
      return res.status(400).json({ error: '`lat` and `lng` must be valid coordinates.' })
    }

    const requestedRadius = Number(req.query.radiusKm)
    const radiusKm = Number.isFinite(requestedRadius)
      ? Math.min(50, Math.max(1, requestedRadius))
      : 20
    const requestedDays = Number(req.query.days)
    const windowDays = Number.isFinite(requestedDays)
      ? Math.min(365, Math.max(1, Math.round(requestedDays)))
      : 30
    const source = typeof req.query.source === 'string' ? req.query.source : 'all'
    if (!SOURCES.has(source)) {
      return res.status(400).json({ error: '`source` must be all | sightings | strays.' })
    }

    const now = new Date()
    const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)
    const sightingQuery = source === 'strays'
      ? Promise.resolve([])
      : Sighting.aggregate(
          geoPipeline(longitude, latitude, radiusKm, since, {
            location: 1,
            createdAt: 1,
            confirmedBy: 1,
          }),
        )
    const strayQuery = source === 'sightings'
      ? Promise.resolve([])
      : Stray.aggregate(
          geoPipeline(longitude, latitude, radiusKm, since, {
            location: 1,
            createdAt: 1,
            condition: 1,
            rescueStatus: 1,
          }),
        )

    const [sightings, strays] = await Promise.all([sightingQuery, strayQuery])
    const sightingPoints = sightings.flatMap((sighting) => {
      const coordinates = coordinatesOf(sighting)
      if (!coordinates) return []
      return [{
        id: String(sighting._id),
        source: 'sighting',
        coordinates,
        intensity: sightingIntensity(sighting, windowDays, now),
        occurredAt: sighting.createdAt,
      }]
    })
    const strayPoints = strays.flatMap((stray) => {
      const coordinates = coordinatesOf(stray)
      if (!coordinates) return []
      return [{
        id: String(stray._id),
        source: 'stray',
        coordinates,
        intensity: strayIntensity(stray, windowDays, now),
        occurredAt: stray.createdAt,
      }]
    })
    const points = [...sightingPoints, ...strayPoints]

    res.json({
      points,
      summary: {
        total: points.length,
        sightings: sightingPoints.length,
        strays: strayPoints.length,
        radiusKm,
        windowDays,
      },
    })
  } catch (error) {
    next(error)
  }
}
