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
  /** Complete eligible totals, before the public cell output limit. */
  total: number
  /** All occupied eligible cells, including cells not returned for display. */
  cellCount: number
  sightings: number
  strays: number
  gridSizeMeters: number
  radiusKm: number
  windowDays: number
  returnedCellCount: number
  /** Reports represented by returned cells, not a replacement for total. */
  returnedTotal: number
  cellsTruncated: boolean
  maxCells: number
}

export interface HotspotResponse {
  cells: HotspotCell[]
  summary: HotspotSummary
}
