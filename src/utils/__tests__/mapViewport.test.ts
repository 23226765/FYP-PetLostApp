import { expect, it } from 'vitest'
import { SUPPORTED_MAP_BOUNDS, sameMapBounds, supportedViewport } from '../mapViewport'
it('limits large and mobile viewports to disclosed Hong Kong coverage without a radius setting', () => {
  expect(supportedViewport({ west: 113, east: 116, south: 20, north: 25 })).toEqual(SUPPORTED_MAP_BOUNDS)
  expect(supportedViewport({ west: -180, east: 180, south: -90, north: 90 })).toEqual(SUPPORTED_MAP_BOUNDS)
  const small = { west: 114.1, east: 114.3, south: 22.3, north: 22.5 }
  expect(supportedViewport(small)).toEqual(small)
  expect(supportedViewport({ ...small, west: small.west - 360, east: small.east - 360 })).toEqual(small)
  expect(supportedViewport({ west: 0, east: 1, south: 0, north: 1 })).toBeNull()
  expect(supportedViewport({ ...small, west: NaN })).toBeNull()
  expect(sameMapBounds(small, { ...small })).toBe(true)
})
