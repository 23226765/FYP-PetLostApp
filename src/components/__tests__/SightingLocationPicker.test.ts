import { flushPromises, mount, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import SightingLocationPicker from '../SightingLocationPicker.vue'
import L from 'leaflet'
import { setSessionToken } from '../../services/authSession'
enableAutoUnmount(afterEach)

const geolocationMocks = vi.hoisted(() => ({
  getCurrentLocation: vi.fn(),
}))

const leafletState = vi.hoisted(() => ({
  mapHandlers: {} as Record<string, (event: any) => void>,
  markers: [] as Array<{
    handlers: Record<string, () => void>
    dragPosition: { lat: number; lng: number } | null
  }>,
}))

vi.mock('../../services/geolocation', () => geolocationMocks)
vi.mock('leaflet.markercluster', () => ({}))
vi.mock('leaflet', () => {
  const mapInstance = {
    on: vi.fn((event: string, handler: (event: any) => void) => {
      leafletState.mapHandlers[event] = handler
      return mapInstance
    }),
    setView: vi.fn(() => mapInstance),
    getZoom: vi.fn(() => 13),
    invalidateSize: vi.fn(),
    remove: vi.fn(),
  }
  return {
    default: {
      map: vi.fn(() => mapInstance),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      divIcon: vi.fn((options: unknown) => options),
      marker: vi.fn((position: [number, number]) => {
        const state = {
          handlers: {} as Record<string, () => void>,
          dragPosition: null as { lat: number; lng: number } | null,
        }
        let current = { lat: position[0], lng: position[1] }
        leafletState.markers.push(state)
        const instance = {
          addTo: vi.fn(() => instance),
          on: vi.fn((event: string, handler: () => void) => {
            state.handlers[event] = handler
            return instance
          }),
          off: vi.fn(),
          remove: vi.fn(),
          getLatLng: vi.fn(() => state.dragPosition || current),
          setLatLng: vi.fn((next: [number, number]) => {
            current = { lat: next[0], lng: next[1] }
            return instance
          }),
          dragging: { enable: vi.fn(), disable: vi.fn() },
        }
        return instance
      }),
    },
  }
})

function mountPicker() {
  return mount(SightingLocationPicker, {
    props: {
      modelValue: null,
      initialCenter: [114.16, 22.28],
    },
    global: { stubs: { AppIcon: { template: '<span />' } } },
  })
}

describe('SightingLocationPicker', () => {
  beforeEach(() => {
    leafletState.mapHandlers = {}
    leafletState.markers = []
    geolocationMocks.getCurrentLocation.mockReset()
  })

  it('selects a point on map click and emits it only after confirmation', async () => {
    const wrapper = mountPicker()
    leafletState.mapHandlers.click({ latlng: { lat: 22.3193, lng: 114.1694 } })
    await nextTick()

    expect(wrapper.text()).toContain('Selected point—confirm to continue')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.get('.confirm-location').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual([114.1694, 22.3193])
  })

  it('updates the selected point when the marker is dragged', async () => {
    const wrapper = mountPicker()
    leafletState.mapHandlers.click({ latlng: { lat: 22.3193, lng: 114.1694 } })
    await nextTick()
    leafletState.markers[0].dragPosition = { lat: 22.3201, lng: 114.1702 }
    leafletState.markers[0].handlers.dragend()
    await nextTick()
    await wrapper.get('.confirm-location').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual([114.1702, 22.3201])
  })

  it('uses geolocation success as a draft point that still requires confirmation', async () => {
    geolocationMocks.getCurrentLocation.mockResolvedValue({ lat: 22.2819, lng: 114.1588 })
    const wrapper = mountPicker()
    await wrapper.get('.current-location').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.get('.confirm-location').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual([114.1588, 22.2819])
  })

  it('keeps manual map selection available after location permission denial', async () => {
    geolocationMocks.getCurrentLocation.mockRejectedValue(new Error('Permission denied'))
    const wrapper = mountPicker()
    await wrapper.get('.current-location').trigger('click')
    await flushPromises()
    expect(wrapper.get('.location-message.error').text()).toContain('permission was denied')

    leafletState.mapHandlers.click({ latlng: { lat: 22.31, lng: 114.17 } })
    await nextTick()
    expect(wrapper.find('.location-message.error').exists()).toBe(false)
    expect(wrapper.get('.confirm-location').attributes('disabled')).toBeUndefined()
  })

  it('does not allow confirmation while the map only shows its initial display centre', () => {
    const wrapper = mountPicker()
    expect(wrapper.get('.confirm-location').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('invalid coordinate edits immediately revoke the previous confirmation and cannot confirm a stale draft', async () => {
    const wrapper = mountPicker()
    await wrapper.setProps({ modelValue: [114.2, 22.4] })
    await wrapper.findAll('.coordinate-fields input')[0].setValue('999')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null])
    await wrapper.setProps({ modelValue: null })
    expect(wrapper.get('.confirm-location').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })

  it('keeps manual keystrokes intact instead of rewriting partial coordinates', async () => {
    const wrapper = mountPicker()
    const fields = wrapper.findAll('.coordinate-fields input')
    await fields[1].setValue('114.21')
    for (const value of ['2', '22', '22.', '22.4', '22.41']) {
      await fields[0].setValue(value)
      expect((fields[0].element as HTMLInputElement).value).toBe(value)
      expect((fields[1].element as HTMLInputElement).value).toBe('114.21')
    }
    await wrapper.get('.confirm-location').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[114.21, 22.41]])
  })

  it('locks marker dragging and map selection while submission is pending', async () => {
    const wrapper = mountPicker()
    leafletState.mapHandlers.click({ latlng: { lat: 22.4, lng: 114.2 } })
    await nextTick()
    const marker = vi.mocked(L.marker).mock.results.at(-1)!.value
    await wrapper.setProps({ disabled: true })
    expect(marker.dragging.disable).toHaveBeenCalled()
    leafletState.mapHandlers.click({ latlng: { lat: 23, lng: 115 } })
    expect(wrapper.get('.confirm-location').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.location-summary').text()).toContain('22.40000, 114.20000')
    await wrapper.setProps({ disabled: false })
    expect(marker.dragging.enable).toHaveBeenCalled()
  })

  it.each(['manual', 'unmount', 'account-switch'])('ignores a late GPS result after %s', async (action) => {
    let finish!: (value: { lng: number; lat: number }) => void
    geolocationMocks.getCurrentLocation.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const wrapper = mountPicker()
    await wrapper.get('.current-location').trigger('click')
    if (action === 'manual') {
      leafletState.mapHandlers.click({ latlng: { lat: 22.4, lng: 114.2 } })
      await nextTick()
      await wrapper.get('.confirm-location').trigger('click')
    } else if (action === 'unmount') wrapper.unmount()
    else setSessionToken('another-user-fixture')
    const events = wrapper.emitted('update:modelValue')?.length || 0
    finish({ lng: 115, lat: 23 }); await flushPromises()
    expect(wrapper.emitted('update:modelValue')?.length || 0).toBe(events)
    if (action === 'manual') expect(wrapper.get('.location-summary').text()).toContain('22.40000, 114.20000')
  })

  it('rejects invalid GPS coordinates without fabricating a point', async () => {
    geolocationMocks.getCurrentLocation.mockResolvedValue({ lat: 999, lng: 114 })
    const wrapper = mountPicker()
    await wrapper.get('.current-location').trigger('click'); await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.get('.confirm-location').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
