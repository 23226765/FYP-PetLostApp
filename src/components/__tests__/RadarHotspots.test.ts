import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RadarScreen from '../RadarScreen.vue'
import { i18n } from '../../i18n'
import type { HotspotResponse } from '../../types/analytics'

const api = vi.hoisted(() => ({ getHotspots: vi.fn() }))
vi.mock('../../services/api', () => api)
const response = (limited: boolean): HotspotResponse => ({ cells: [{ coordinates: [114.188, 22.381], locationPrecision: 'approximate', count: 6, sightingCount: 3, strayCount: 3, intensity: 0.9 }], summary: {
  total: 3210, sightings: 1605, strays: 1605, cellCount: limited ? 1600 : 1,
  returnedCellCount: limited ? 1500 : 1, returnedTotal: limited ? 3010 : 3210,
  cellsTruncated: limited, maxCells: 1500, gridSizeMeters: 750, radiusKm: 20, windowDays: 30,
} })
const createWrapper = () => mount(RadarScreen, { props: { pets: [], radiusKm: 20, species: 'All', breed: '', district: '', unreadCount: 0, userLocation: { lat: 22.381, lng: 114.188 } }, global: { plugins: [i18n], stubs: { AppIcon: true, MapView: true, PetCard: true } } })
async function showHotspots(wrapper: ReturnType<typeof createWrapper>) {
  await wrapper.get('.toggle button:nth-child(2)').trigger('click')
  await wrapper.get('.layer-buttons button:nth-child(2)').trigger('click')
  await flushPromises()
}

describe('honest hotspot coverage', () => {
  beforeEach(() => { vi.resetAllMocks(); i18n.global.locale.value = 'en' })

  it.each(['en', 'zh-HK', 'zh-CN'] as const)('%s separates full totals from a capped map', async (locale) => {
    i18n.global.locale.value = locale
    api.getHotspots.mockResolvedValue(response(true))
    const wrapper = createWrapper()
    await showHotspots(wrapper)
    expect(wrapper.get('.analytics-card strong').text()).toContain('3210')
    const coverage = wrapper.get('.hotspot-limit').text()
    expect(coverage).toBe(i18n.global.t('hotspotCoverage.limited', { shown: 1500, total: 1600 }))
    expect(coverage).not.toContain('hotspotCoverage.')
    expect(wrapper.getComponent({ name: 'MapView' }).props('heatCells')).toEqual(response(true).cells)
    wrapper.unmount()
  })

  it('omits the limit notice for complete cell output and removes old totals after a query failure', async () => {
    api.getHotspots.mockResolvedValueOnce(response(false)).mockRejectedValueOnce(new Error('isolated network fixture'))
    const wrapper = createWrapper()
    await showHotspots(wrapper)
    expect(wrapper.find('.hotspot-limit').exists()).toBe(false)
    await wrapper.setProps({ radiusKm: 10 })
    await flushPromises()
    expect(wrapper.find('.analytics-card strong').exists()).toBe(false)
    expect(wrapper.getComponent({ name: 'MapView' }).props('heatCells')).toEqual([])
    wrapper.unmount()
  })
})
