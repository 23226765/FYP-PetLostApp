export type HotspotSource = 'sighting' | 'stray'

export interface HotspotPoint {
  id: string
  source: HotspotSource
  /** GeoJSON coordinate order: [longitude, latitude]. */
  coordinates: [number, number]
  /** Normalized heat intensity from 0.1 to 1. */
  intensity: number
  occurredAt: string
}

export interface HotspotSummary {
  total: number
  sightings: number
  strays: number
  radiusKm: number
  windowDays: number
}

export interface HotspotResponse {
  points: HotspotPoint[]
  summary: HotspotSummary
}
