import type { MapBounds } from '../types/pet'

// Public browsing coverage only; these values never become report coordinates.
export const SUPPORTED_MAP_BOUNDS: Readonly<MapBounds> = Object.freeze({ west: 113.82, south: 22.15, east: 114.50, north: 22.57 })
export const MAP_OVERVIEW_CENTER = { lat: 22.36, lng: 114.16 }

/** Query the visible part of our disclosed Hong Kong coverage, not the world. */
export function supportedViewport(bounds: MapBounds): MapBounds | null {
  if (!Object.values(bounds).every(Number.isFinite) || bounds.west >= bounds.east || bounds.south >= bounds.north) return null
  const width = bounds.east - bounds.west
  const shift = width >= 360 ? 0 : Math.round((MAP_OVERVIEW_CENTER.lng - (bounds.west + bounds.east) / 2) / 360) * 360
  const west = width >= 360 ? SUPPORTED_MAP_BOUNDS.west : Math.max(bounds.west + shift, SUPPORTED_MAP_BOUNDS.west)
  const east = width >= 360 ? SUPPORTED_MAP_BOUNDS.east : Math.min(bounds.east + shift, SUPPORTED_MAP_BOUNDS.east)
  const south = Math.max(bounds.south, SUPPORTED_MAP_BOUNDS.south), north = Math.min(bounds.north, SUPPORTED_MAP_BOUNDS.north)
  const stable = (value: number) => Number(value.toFixed(9))
  return west < east && south < north ? { west: stable(west), south: stable(south), east: stable(east), north: stable(north) } : null
}

export function sameMapBounds(left: MapBounds | null, right: MapBounds | null): boolean {
  return left === right || Boolean(left && right && left.west === right.west && left.east === right.east && left.south === right.south && left.north === right.north)
}
