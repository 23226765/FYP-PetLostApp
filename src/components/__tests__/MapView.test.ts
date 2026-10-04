import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Sighting } from '../../types/pet'
import type { HotspotCell } from '../../types/analytics'
import MapView from '../MapView.vue'

const leafletState = vi.hoisted(() => ({
  trajectoryMarkers: [] as Array<{
    position: [number, number]
    handlers: Record<string, () => void>
    openPopup: ReturnType<typeof vi.fn>
  }>,
  clusterLayers: [] as any[],
  clusterOptions: null as any,
  clearLayers: vi.fn(),
  zoomToShowLayer: vi.fn(),
  fitBounds: vi.fn(),
  setView: vi.fn(),
  heatPoints: [] as Array<[number, number, number]>,
  heatOptions: null as Record<string, unknown> | null,
}))

vi.mock('leaflet.markercluster', () => ({}))
vi.mock('../../services/geolocation', () => ({
  getCurrentLocation: vi.fn(),
}))
vi.mock('leaflet', () => {
  const mapInstance: any = {
    setView: leafletState.setView,
    fitBounds: leafletState.fitBounds,
    panTo: vi.fn(),
    getZoom: vi.fn(() => 13),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
    hasLayer: vi.fn(() => true),
    removeLayer: vi.fn(),
  }
  const makeLayerGroup = () => {
    const instance: any = {
      addTo: vi.fn(() => instance),
      addLayer: vi.fn(),
      clearLayers: vi.fn(),
    }
    return instance
  }
  return {
    default: {
      map: vi.fn(() => mapInstance),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      layerGroup: vi.fn(makeLayerGroup),
      markerClusterGroup: vi.fn((options: any) => {
        leafletState.clusterOptions = options
        const instance: any = {
          addTo: vi.fn(() => instance),
          addLayer: vi.fn((marker: any) => {
            leafletState.clusterLayers.push(marker)
            return instance
          }),
          clearLayers: vi.fn(() => {
            leafletState.clusterLayers = []
            leafletState.clearLayers()
          }),
          zoomToShowLayer: vi.fn((marker: any, callback: () => void) => {
            leafletState.zoomToShowLayer(marker)
            callback()
          }),
        }
        return instance
      }),
      marker: vi.fn((position: [number, number], options: any) => {
        const handlers: Record<string, () => void> = {}
        const openPopup = vi.fn()
        const instance: any = {
          bindPopup: vi.fn(() => instance),
          on: vi.fn((event: string, handler: () => void) => {
            handlers[event] = handler
            return instance
          }),
          addTo: vi.fn((layer: any) => {
            layer.addLayer?.(instance)
            return instance
          }),
          getPopup: vi.fn(() => null),
          getElement: vi.fn(() => null),
          getLatLng: vi.fn(() => ({ lat: position[0], lng: position[1] })),
          openPopup,
          remove: vi.fn(),
        }
        if (String(options?.icon?.html || '').includes('pawradar-trajectory-marker')) {
          leafletState.trajectoryMarkers.push({ position, handlers, openPopup })
        }
        return instance
      }),
      divIcon: vi.fn((options: any) => options),
      polyline: vi.fn(() => ({ addTo: vi.fn() })),
      heatLayer: vi.fn((points: Array<[number, number, number]>, options: Record<string, unknown>) => {
        leafletState.heatPoints = points
        leafletState.heatOptions = options
        const instance = { addTo: vi.fn(() => instance), remove: vi.fn() }
        return instance
      }),
      circle: vi.fn(() => ({
        addTo: vi.fn(),
        setRadius: vi.fn(),
        setLatLng: vi.fn(),
      })),
      latLngBounds: vi.fn(() => ({ pad: vi.fn(() => ({})) })),
    },
  }
})

function report(id: string, coordinates: [number, number], sightedAt: string): Sighting {
  return {
    id,
    petId: 'maple-id',
    coordinates,
    locationPrecision: 'exact',
    locationName: id,
    sightedAt,
    createdAt: sightedAt,
    canViewContact: false,
  }
}

function mountMap(sightings: Sighting[], focusedSightingId?: string) {
  return mount(MapView, {
    props: {
      pets: [],
      sightings,
      focusedSightingId,
      center: { lat: 22.3, lng: 114.17 },
      radiusKm: 0,
    },
  })
}

describe('MapView sighting trajectory', () => {
  beforeEach(() => {
    leafletState.trajectoryMarkers = []
    leafletState.clusterLayers = []
    leafletState.clusterOptions = null
    leafletState.clearLayers.mockClear()
    leafletState.zoomToShowLayer.mockClear()
    leafletState.fitBounds.mockClear()
    leafletState.setView.mockClear()
    leafletState.heatPoints = []
    leafletState.heatOptions = null
  })

  it('creates three separate marker positions for three distinct locations', async () => {
    mountMap([
      report('one', [114.16, 22.28], '2026-09-18T08:00:00Z'),
      report('two', [114.17, 22.29], '2026-09-18T09:00:00Z'),
      report('three', [114.18, 22.3], '2026-09-18T10:00:00Z'),
    ])
    await flushPromises()
    expect(leafletState.trajectoryMarkers.map((marker) => marker.position)).toEqual([
      [22.28, 114.16],
      [22.29, 114.17],
      [22.3, 114.18],
    ])
    expect(new Set(leafletState.trajectoryMarkers.map((marker) => marker.position.join(','))).size).toBe(3)
  })

  it('places three identical reports in a cluster capable of showing count three', async () => {
    const samePoint: [number, number] = [114.1694, 22.3193]
    mountMap([
      report('one', samePoint, '2026-09-18T08:00:00Z'),
      report('two', samePoint, '2026-09-18T09:00:00Z'),
      report('three', samePoint, '2026-09-18T10:00:00Z'),
    ])
    await flushPromises()
    expect(leafletState.clusterLayers).toHaveLength(3)
    const icon = leafletState.clusterOptions.iconCreateFunction({ getChildCount: () => 3 })
    expect(icon.html).toContain('>3</span>')
    expect(leafletState.clusterOptions.zoomToBoundsOnClick).toBe(true)
    expect(leafletState.clusterOptions.spiderfyOnMaxZoom).toBe(true)
  })

  it('links marker clicks to timeline ids and timeline focus back to the marker', async () => {
    const wrapper = mountMap([
      report('first-id', [114.16, 22.28], '2026-09-18T08:00:00Z'),
      report('second-id', [114.17, 22.29], '2026-09-18T09:00:00Z'),
    ])
    await flushPromises()
    leafletState.trajectoryMarkers[1].handlers.click()
    expect(wrapper.emitted('sighting-open')?.[0]).toEqual(['second-id'])

    await wrapper.setProps({ focusedSightingId: 'first-id' })
    await flushPromises()
    expect(leafletState.zoomToShowLayer).toHaveBeenCalledTimes(1)
    expect(leafletState.trajectoryMarkers[0].openPopup).toHaveBeenCalledTimes(1)
  })

  it('replaces markers on refresh instead of duplicating them', async () => {
    const sightings = [
      report('one', [114.16, 22.28], '2026-09-18T08:00:00Z'),
      report('two', [114.17, 22.29], '2026-09-18T09:00:00Z'),
      report('three', [114.18, 22.3], '2026-09-18T10:00:00Z'),
    ]
    const wrapper = mountMap(sightings)
    await flushPromises()
    await wrapper.setProps({ sightings: sightings.map((item) => ({ ...item })) })
    await flushPromises()
    expect(leafletState.clearLayers).toHaveBeenCalled()
    expect(leafletState.clusterLayers).toHaveLength(3)
  })

  it('renders one Leaflet heat point for each aggregate hotspot cell', async () => {
    const cell: HotspotCell = {
      coordinates: [114.187, 22.379],
      locationPrecision: 'approximate',
      count: 4,
      sightingCount: 3,
      strayCount: 1,
      intensity: 0.82,
    }
    mount(MapView, {
      props: {
        pets: [],
        heatCells: [cell],
        showHeatmap: true,
        center: { lat: 22.3, lng: 114.17 },
        radiusKm: 5,
      },
    })
    await flushPromises()

    expect(leafletState.heatPoints).toEqual([[22.379, 114.187, 0.82]])
    expect(leafletState.heatOptions).toEqual(expect.objectContaining({ max: 1, radius: 28 }))
  })
})
