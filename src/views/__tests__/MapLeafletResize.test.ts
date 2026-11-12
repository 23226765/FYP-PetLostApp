import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import L from 'leaflet'
import MapScreen from '../MapScreen.vue'
import { SUPPORTED_MAP_BOUNDS } from '../../utils/mapViewport'

// Actual Leaflet geometry/events, simulated container dimensions and mocked HTTP.
// No tiles, provider calls or database operations are performed in this suite.
const fixture = vi.hoisted(() => ({ height: 580, width: 460, maps: [] as import('leaflet').Map[], getMapPets: vi.fn() }))
vi.mock('../../services/api', () => ({ getMapPets: fixture.getMapPets }))
vi.mock('leaflet.markercluster', () => ({}))
vi.mock('leaflet', async importOriginal => {
  const original = await importOriginal<typeof import('leaflet') & { default: typeof L }>()
  const actual = original.default
  return { ...original, default: {
    ...actual,
    map: (element: HTMLElement, options: L.MapOptions) => {
      Object.defineProperties(element, {
        clientWidth: { get: () => fixture.width }, clientHeight: { get: () => fixture.height },
      })
      const map = actual.map(element, { maxZoom: 19, zoomAnimation: false, fadeAnimation: false, ...options })
      fixture.maps.push(map)
      return map
    },
    tileLayer: () => { const tiles = { on: () => tiles, off: () => tiles, addTo: () => tiles }; return tiles },
    markerClusterGroup: () => actual.layerGroup(),
  } }
})

let resize!: ResizeObserverCallback
const original3d = L.Browser.any3d
const response = () => ({
  markers: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0, hasMore: false }, bounds: SUPPORTED_MAP_BOUNDS,
  insights: { total: 0, speciesCounts: { dog: 0, cat: 0, other: 0 }, unclassifiedSpeciesCount: 0, topDistricts: [], topDistrictCount: 0, unknownDistrictCount: 0, unknownIsTop: false, recentCount: 0, unknownDateCount: 0, futureDateCount: 0, windowStart: '2026-10-21T12:00:00Z', windowEnd: '2026-10-28T12:00:00Z' },
})
beforeEach(() => {
  // jsdom has no CSS transform engine; simulate the capability reported by
  // modern mobile/desktop browsers so real Leaflet can use fractional zoom.
  Object.defineProperty(L.Browser, 'any3d', { value: true, configurable: true, writable: true })
  fixture.height = 580; fixture.width = 460; fixture.maps = []
  fixture.getMapPets.mockReset().mockResolvedValue(response())
  vi.useFakeTimers()
  vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { resize = callback } observe() {} disconnect() {} })
})
afterEach(() => {
  Object.defineProperty(L.Browser, 'any3d', { value: original3d, configurable: true, writable: true })
  vi.useRealTimers(); vi.unstubAllGlobals()
})

it('does not turn loading/loaded panel size changes into new searches or an endless loading cycle', async () => {
  const wrapper = mount(MapScreen, { props: { active: true } })
  try {
    await flushPromises(); await vi.advanceTimersByTimeAsync(30)
    const map = fixture.maps[0]
    map.setView([22.36, 114.16], 13, { animate: false })
    await vi.advanceTimersByTimeAsync(350); await flushPromises()
    const calls = fixture.getMapPets.mock.calls.length
    const size = map.getSize().clone(), boundsBeforeSheet = map.getBounds().toBBoxString()
    const invalidate = vi.spyOn(map, 'invalidateSize')
    for (let attempt = 0; attempt < 3; attempt++) {
      await wrapper.get('.insights-trigger').trigger('click')
      await vi.advanceTimersByTimeAsync(350)
      await wrapper.get('.insights-close').trigger('click')
      await vi.advanceTimersByTimeAsync(350)
    }
    expect(fixture.maps).toHaveLength(1)
    expect(map.getSize()).toEqual(size)
    expect(map.getBounds().toBBoxString()).toBe(boundsBeforeSheet)
    expect(invalidate).not.toHaveBeenCalled()
    expect(fixture.getMapPets).toHaveBeenCalledTimes(calls)
    // Insights expands after success, then shrinks during a request. Both change
    // the flex map's available height without any user pan or zoom.
    for (const height of [400, 580, 400, 580]) {
      fixture.height = height; resize([], {} as ResizeObserver)
      await vi.advanceTimersByTimeAsync(350); await flushPromises()
    }
    expect(fixture.getMapPets).toHaveBeenCalledTimes(calls)
    expect(wrapper.get('.map-canvas').attributes('aria-busy')).toBe('false')
    expect(wrapper.get('.search-area').attributes('disabled')).toBeUndefined()
    expect(wrapper.getComponent({ name: 'AreaInsightsCard' }).props('insights')).toEqual(response().insights)
    // Explicit search still uses the current resized viewport.
    await wrapper.get('.search-area').trigger('click'); await flushPromises()
    expect(fixture.getMapPets).toHaveBeenCalledTimes(calls + 1)
    const bounds = map.getBounds(), query = fixture.getMapPets.mock.calls.at(-1)![0]
    expect(query.west).toBeCloseTo(bounds.getWest(), 8)
    expect(query.north).toBeCloseTo(bounds.getNorth(), 8)
  } finally { wrapper.unmount() }
})

it('fits a Hong Kong overview without rounding nearly a full zoom level out', async () => {
  const wrapper = mount(MapScreen, { props: { active: true } })
  try {
    await flushPromises()
    const map = fixture.maps[0]
    const snap = map.options.zoomSnap
    map.options.zoomSnap = 0
    const ideal = map.getBoundsZoom([[22.15, 113.82], [22.57, 114.5]], false, L.point(24, 24))
    map.options.zoomSnap = snap
    expect(map.getBounds().contains([[22.15, 113.82], [22.57, 114.5]])).toBe(true)
    expect(ideal).toBeGreaterThanOrEqual(9.5)
    expect(map.getZoom()).toBeGreaterThanOrEqual(9.5)
    expect(ideal - map.getZoom()).toBeLessThan(0.26)
    map.options.zoomSnap = 1
    expect(map.getBoundsZoom([[22.15, 113.82], [22.57, 114.5]], false, L.point(24, 24))).toBe(9)
    map.options.zoomSnap = snap
  } finally { wrapper.unmount() }
})
