import Sighting from '../models/Sighting.js'
import Stray from '../models/Stray.js'
import { hotspotPipeline, publicHotspotResult, PUBLIC_GRID_SIZE_METERS, HOTSPOT_QUERY_OPTIONS } from '../services/hotspotAnalytics.js'
import { anonymousSearchCoordinates, setLocationPrivacyHeaders } from '../services/locationPrivacy.js'

const SOURCES = new Set(['all', 'sightings', 'strays'])

function validCoordinate(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum
}

// GET /api/analytics/hotspots: full eligible totals, bounded public grid cells.
export async function listHotspots(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    const latitude = Number(req.query.lat)
    const longitude = Number(req.query.lng)
    if (!validCoordinate(latitude, -90, 90) || !validCoordinate(longitude, -180, 180)) {
      return res.status(400).json({ error: '`lat` and `lng` must be valid coordinates.' })
    }
    const requestedRadius = Number(req.query.radiusKm)
    const radiusKm = Number.isFinite(requestedRadius) ? Math.min(50, Math.max(1, requestedRadius)) : 20
    const requestedDays = Number(req.query.days)
    const windowDays = Number.isFinite(requestedDays) ? Math.min(365, Math.max(1, Math.round(requestedDays))) : 30
    const source = typeof req.query.source === 'string' ? req.query.source : 'all'
    if (!SOURCES.has(source)) return res.status(400).json({ error: '`source` must be all | sightings | strays.' })

    const now = new Date()
    // Every role uses the same origin. The pipeline decides membership from
    // public grid centres, so changing radius cannot probe exact source points.
    const [searchLongitude, searchLatitude] = anonymousSearchCoordinates(null, [longitude, latitude])
    const options = { longitude: searchLongitude, latitude: searchLatitude, radiusKm, windowDays, now,
      since: new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000) }
    const Model = source === 'strays' ? Stray : Sighting
    const [result] = await Model.aggregate(hotspotPipeline(source, options), HOTSPOT_QUERY_OPTIONS)
    const response = publicHotspotResult(result)
    res.json({ cells: response.cells, summary: { ...response.summary, gridSizeMeters: PUBLIC_GRID_SIZE_METERS, radiusKm, windowDays } })
  } catch (error) { next(error) }
}
