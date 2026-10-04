import Sighting from '../models/Sighting.js'
import Stray from '../models/Stray.js'
import { visibleContentFilter } from '../services/moderationVisibility.js'
import {
  aggregateHotspotCells,
  PUBLIC_GRID_SIZE_METERS,
} from '../services/hotspotAnalytics.js'
import {
  anonymousSearchCoordinates,
  setLocationPrivacyHeaders,
} from '../services/locationPrivacy.js'

const SOURCES = new Set(['all', 'sightings', 'strays'])
const MAX_POINTS_PER_SOURCE = 750

function validCoordinate(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum
}

function geoPipeline(
  longitude,
  latitude,
  radiusKm,
  since,
  projection,
  { query = {}, requireVisiblePet = false } = {},
) {
  const pipeline = [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [longitude, latitude] },
        distanceField: 'distanceMeters',
        maxDistance: radiusKm * 1000,
        spherical: true,
        key: 'location',
        query,
      },
    },
    { $match: { createdAt: { $gte: since } } },
  ]
  if (requireVisiblePet) {
    pipeline.push(
      {
        $lookup: {
          from: 'pets',
          localField: 'pet',
          foreignField: '_id',
          as: 'parentPet',
        },
      },
      {
        $match: {
          'parentPet.0': { $exists: true },
          'parentPet.moderationStatus': { $ne: 'hidden' },
        },
      },
    )
  }
  pipeline.push({ $limit: MAX_POINTS_PER_SOURCE }, { $project: projection })
  return pipeline
}

// GET /api/analytics/hotspots
export async function listHotspots(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
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
    const searchCoordinates = anonymousSearchCoordinates(null, [longitude, latitude])
    const [searchLongitude, searchLatitude] = searchCoordinates
    const sightingQuery = source === 'strays'
      ? Promise.resolve([])
      : Sighting.aggregate(
          geoPipeline(searchLongitude, searchLatitude, radiusKm, since, {
            _id: 0,
            location: 1,
            createdAt: 1,
            confirmedBy: 1,
          }, {
            query: visibleContentFilter(),
            requireVisiblePet: true,
          }),
        )
    const strayQuery = source === 'sightings'
      ? Promise.resolve([])
      : Stray.aggregate(
          geoPipeline(searchLongitude, searchLatitude, radiusKm, since, {
            _id: 0,
            location: 1,
            createdAt: 1,
            condition: 1,
            rescueStatus: 1,
          }, {
            query: visibleContentFilter({ active: { $ne: false } }),
          }),
        )

    const [sightings, strays] = await Promise.all([sightingQuery, strayQuery])
    const cells = aggregateHotspotCells({ sightings, strays }, windowDays, now)
    const sightingCount = cells.reduce((total, cell) => total + cell.sightingCount, 0)
    const strayCount = cells.reduce((total, cell) => total + cell.strayCount, 0)

    res.json({
      cells,
      summary: {
        total: sightingCount + strayCount,
        cellCount: cells.length,
        sightings: sightingCount,
        strays: strayCount,
        gridSizeMeters: PUBLIC_GRID_SIZE_METERS,
        radiusKm,
        windowDays,
      },
    })
  } catch (error) {
    next(error)
  }
}
