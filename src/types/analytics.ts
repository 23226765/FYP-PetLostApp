export interface HotspotCell {
  /** GeoJSON coordinate order: [longitude, latitude]. */
  coordinates: [number, number]
  locationPrecision: 'approximate'
  count: number
  sightingCount: number
  strayCount: number
  /** Saturating aggregate heat intensity from 0.1 to 1. */
  intensity: number
}

export interface HotspotSummary {
  total: number
  cellCount: number
  sightings: number
  strays: number
  gridSizeMeters: number
  radiusKm: number
  windowDays: number
}

export interface HotspotResponse {
  cells: HotspotCell[]
  summary: HotspotSummary
}
