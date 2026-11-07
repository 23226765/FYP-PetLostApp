import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import type { AreaInsights } from '../../types/pet'
import MapScreen from '../MapScreen.vue'
import { setSessionToken } from '../../services/authSession'
import { i18n } from '../../i18n'
import { SUPPORTED_MAP_BOUNDS } from '../../utils/mapViewport'
const api = vi.hoisted(() => ({ getMapPets: vi.fn() }))
vi.mock('../../services/api', () => api)
const marker = (id: string) => ({ id, name: id, species: 'Dog', breed: '', status: 'lost', district: 'Sha Tin', photo: '', coordinates: [114.1, 22.3], locationPrecision: 'approximate', locationSource: 'stored_report' })
const response = (ids: string[], page = 1, hasMore = false) => ({ markers: ids.map(marker), pagination: { page, limit: 100, total: 201, totalPages: 3, hasMore }, gridSizeMeters: 750, bounds: SUPPORTED_MAP_BOUNDS })
const insights = (count: number): AreaInsights => ({ total: count, speciesCounts: { dog: count, cat: 0, other: 0 }, unclassifiedSpeciesCount: 0, topDistricts: ['Sha Tin'], topDistrictCount: count, unknownDistrictCount: 0, unknownIsTop: false, recentCount: count, unknownDateCount: 0, futureDateCount: 0, windowStart: '2026-10-21T12:00:00Z', windowEnd: '2026-10-28T12:00:00Z' })
function render() { return mount(MapScreen, { props: { active: true }, global: { stubs: { MapView: { name: 'MapView', props: ['discoveryPets', 'center', 'initialZoom', 'initialBounds'], template: '<div class="map-stub" />' }, AppIcon: true } } }) }
beforeEach(() => { vi.resetAllMocks(); setSessionToken(null); i18n.global.locale.value = 'en'; api.getMapPets.mockResolvedValue(response(['one'])) })
it('uses the safe marker endpoint, preserves server totals, deduplicates pages, and opens by ID', async () => {
  api.getMapPets.mockResolvedValueOnce(response(['one'], 1, true)).mockResolvedValueOnce(response(['one', 'two'], 2))
  const wrapper = render(); await flushPromises()
  expect(api.getMapPets.mock.calls[0]?.[0]).toEqual({ ...SUPPORTED_MAP_BOUNDS, page: 1, limit: 100 })
  expect(wrapper.getComponent({ name: 'MapView' }).props('initialBounds')).toEqual(SUPPORTED_MAP_BOUNDS)
  expect(wrapper.text()).toContain('1 of 201')
  await wrapper.get('.map-feedback button').trigger('click'); await flushPromises()
  const map = wrapper.getComponent({ name: 'MapView' })
  expect(map.props('discoveryPets').map((item: { id: string }) => item.id)).toEqual(['one', 'two'])
  map.vm.$emit('open-marker', 'two'); expect(wrapper.emitted('open-pet')).toEqual([['two']])
  wrapper.unmount()
})
it('retains the viewed area across detail navigation and explicitly searches the new area', async () => {
  const wrapper = render(); await flushPromises()
  wrapper.getComponent({ name: 'MapView' }).vm.$emit('view-change', { lat: 22.4, lng: 114.2, zoom: 15, bounds: { west: 114.1, east: 114.3, south: 22.3, north: 22.5 } })
  await wrapper.get('.search-area').trigger('click'); await flushPromises()
  expect(api.getMapPets.mock.calls.at(-1)?.[0]).toEqual({ west: 114.1, east: 114.3, south: 22.3, north: 22.5, page: 1, limit: 100 })
  const calls = api.getMapPets.mock.calls.length
  await wrapper.setProps({ active: false }); await wrapper.setProps({ active: true }); await flushPromises()
  expect(wrapper.getComponent({ name: 'MapView' }).props('initialZoom')).toBe(15)
  expect(api.getMapPets).toHaveBeenCalledTimes(calls)
  wrapper.unmount()
})
it('clears old markers and rejects delayed results after account switching', async () => {
  let finish!: (result: unknown) => void
  api.getMapPets.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  api.getMapPets.mockResolvedValueOnce(response([]))
  const wrapper = render(); setSessionToken('different-fixture-account'); await flushPromises()
  finish(response(['obsolete'])); await flushPromises()
  expect(wrapper.getComponent({ name: 'MapView' }).props('discoveryPets')).toEqual([])
  expect(api.getMapPets).toHaveBeenCalledTimes(2)
  wrapper.unmount()
})
it.each(['en', 'zh-HK', 'zh-CN'] as const)('%s exposes useful error/retry and empty states without raw keys', async locale => {
  i18n.global.locale.value = locale
  api.getMapPets.mockRejectedValueOnce(Object.assign(new Error('Invalid pet id'), { status: 400 })).mockResolvedValueOnce(response([]))
  const wrapper = render(); await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  expect(wrapper.get('[role="alert"]').text()).toContain(i18n.global.t('mapStatus.markersFailed'))
  expect(wrapper.text()).not.toContain(i18n.global.t('mapStatus.empty'))
  expect(wrapper.text()).not.toContain(i18n.global.t('mapStatus.tilesFailed'))
  expect(wrapper.findComponent({ name: 'MapView' }).exists()).toBe(true)
  await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain(i18n.global.t('mapStatus.empty'))
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('discoveryMap.')
  wrapper.unmount()
})

it('keeps marker-specific context when a localized network error supplies additional detail', async () => {
  api.getMapPets.mockRejectedValueOnce(Object.assign(new Error('Network failure'), { apiCode: 'NETWORK_UNAVAILABLE' }))
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain(i18n.global.t('mapStatus.markersFailed'))
  expect(wrapper.get('[role="alert"]').text()).toContain(i18n.global.t('errors.network'))
  expect(wrapper.text()).not.toContain(i18n.global.t('mapStatus.empty'))
  wrapper.unmount()
})

it('debounces viewport changes, replaces area results and pages only within the new bounds', async () => {
  vi.useFakeTimers()
  const wrapper = render()
  try {
    await flushPromises()
    const bounds = { west: 114.1, east: 114.3, south: 22.3, north: 22.5 }
    const map = wrapper.getComponent({ name: 'MapView' })
    map.vm.$emit('view-change', { lat: 22.4, lng: 114.2, zoom: 13, bounds })
    map.vm.$emit('view-change', { lat: 22.4, lng: 114.2, zoom: 14, bounds })
    api.getMapPets.mockResolvedValueOnce(response(['new-area'], 1, true)).mockResolvedValueOnce(response(['second-page'], 2))
    await vi.advanceTimersByTimeAsync(300); await flushPromises()
    expect(api.getMapPets).toHaveBeenCalledTimes(2)
    expect(api.getMapPets.mock.calls.at(-1)?.[0]).toEqual({ ...bounds, page: 1, limit: 100 })
    expect(map.props('discoveryPets').map((item: { id: string }) => item.id)).toEqual(['new-area'])
    await wrapper.get('.map-feedback button').trigger('click'); await flushPromises()
    expect(api.getMapPets.mock.calls.at(-1)?.[0]).toEqual({ ...bounds, page: 2, limit: 100 })
    expect(map.props('discoveryPets').map((item: { id: string }) => item.id)).toEqual(['new-area', 'second-page'])
    const calls = api.getMapPets.mock.calls.length
    await wrapper.setProps({ active: false }); await wrapper.setProps({ active: true }); await flushPromises()
    expect(api.getMapPets).toHaveBeenCalledTimes(calls)
    expect(wrapper.getComponent({ name: 'MapView' }).props('discoveryPets')).toHaveLength(2)
  } finally { wrapper.unmount(); vi.useRealTimers() }
})

it('retains the full overview on initial fit and does not download outside supported coverage', async () => {
  const wrapper = render(); await flushPromises()
  const map = wrapper.getComponent({ name: 'MapView' })
  map.vm.$emit('view-change', { lat: 22.36, lng: 114.16, zoom: 9, bounds: { west: 113, east: 115, south: 21, north: 24 }, initial: true })
  await flushPromises(); expect(api.getMapPets).toHaveBeenCalledTimes(1)
  map.vm.$emit('view-change', { lat: 10, lng: 10, zoom: 13, bounds: { west: 9, east: 11, south: 9, north: 11 } })
  await flushPromises(); expect(api.getMapPets).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).toContain(i18n.global.t('mapViewport.outside'))
  expect(map.props('discoveryPets')).toEqual([])
  wrapper.unmount()
})

it('commits server insights with their marker response and never derives counts from loaded page length', async () => {
  api.getMapPets.mockResolvedValueOnce({ ...response(['first'], 1, true), insights: insights(201) }).mockResolvedValueOnce({ ...response(['second'], 2), insights: insights(201) })
  const wrapper = render(); await flushPromises()
  const card = wrapper.getComponent({ name: 'AreaInsightsCard' })
  expect(card.props('insights').total).toBe(201)
  await wrapper.get('.map-feedback button').trigger('click'); await flushPromises()
  expect(wrapper.getComponent({ name: 'MapView' }).props('discoveryPets')).toHaveLength(2)
  expect(card.props('insights').total).toBe(201)
  const calls = api.getMapPets.mock.calls.length
  await wrapper.setProps({ active: false }); await wrapper.setProps({ active: true })
  expect(api.getMapPets).toHaveBeenCalledTimes(calls)
  expect(card.props('insights').total).toBe(201)
  wrapper.unmount()
})

it('clears old-area counts while updating and ignores stale metrics from an abandoned query', async () => {
  vi.useFakeTimers()
  let oldResult!: (value: unknown) => void
  api.getMapPets.mockReturnValueOnce(new Promise(resolve => { oldResult = resolve }))
  api.getMapPets.mockResolvedValueOnce({ ...response(['new']), insights: insights(1) })
  const wrapper = render()
  try {
    wrapper.getComponent({ name: 'MapView' }).vm.$emit('view-change', { lat: 22.4, lng: 114.2, zoom: 15, bounds: { west: 114.1, east: 114.3, south: 22.3, north: 22.5 } })
    await vi.advanceTimersByTimeAsync(300); await flushPromises()
    oldResult({ ...response(['old']), insights: insights(999) }); await flushPromises()
    expect(wrapper.getComponent({ name: 'AreaInsightsCard' }).props('insights').total).toBe(1)
    expect(wrapper.getComponent({ name: 'MapView' }).props('discoveryPets').map((item: { id: string }) => item.id)).toEqual(['new'])
  } finally { wrapper.unmount(); vi.useRealTimers() }
})

it('makes failed or unavailable statistics explicit and clears them on account changes', async () => {
  api.getMapPets.mockResolvedValueOnce({ ...response(['first']), insights: insights(201) }).mockRejectedValueOnce(new Error('Temporary failure')).mockResolvedValueOnce(response(['replacement']))
  const wrapper = render(); await flushPromises()
  await wrapper.get('.map-heading button').trigger('click'); await flushPromises()
  expect(wrapper.getComponent({ name: 'AreaInsightsCard' }).props('failed')).toBe(true)
  expect(wrapper.getComponent({ name: 'AreaInsightsCard' }).text()).toContain(i18n.global.t('areaInsights.unavailable'))
  setSessionToken('replacement-account'); await flushPromises()
  expect(wrapper.getComponent({ name: 'AreaInsightsCard' }).props('insights')).toBeNull()
  wrapper.unmount()
})

it('retries a failed next page without losing loaded markers, totals or the committed bounds', async () => {
  api.getMapPets.mockResolvedValueOnce(response(['first'], 1, true)).mockRejectedValueOnce(new Error('Temporary page failure')).mockResolvedValueOnce(response(['second'], 2))
  const wrapper = render(); await flushPromises()
  try {
    await wrapper.get('.map-feedback button').trigger('click'); await flushPromises()
    expect(wrapper.getComponent({ name: 'MapView' }).props('discoveryPets').map((item: { id: string }) => item.id)).toEqual(['first'])
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
    expect(api.getMapPets.mock.calls.at(-1)?.[0]).toEqual({ ...SUPPORTED_MAP_BOUNDS, page: 2, limit: 100 })
    expect(wrapper.getComponent({ name: 'MapView' }).props('discoveryPets').map((item: { id: string }) => item.id)).toEqual(['first', 'second'])
    expect(wrapper.text()).toContain('2 of 201')
  } finally { wrapper.unmount() }
})

it('a previous-area failure/finally cannot clear the loading state or replace a newer result', async () => {
  vi.useFakeTimers()
  let rejectOld!: (reason: unknown) => void, finishNew!: (value: unknown) => void
  api.getMapPets.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectOld = reject }))
  api.getMapPets.mockReturnValueOnce(new Promise(resolve => { finishNew = resolve }))
  const wrapper = render()
  try {
    const bounds = { west: 114.1, east: 114.3, south: 22.3, north: 22.5 }
    wrapper.getComponent({ name: 'MapView' }).vm.$emit('view-change', { lat: 22.4, lng: 114.2, zoom: 15, bounds })
    await vi.advanceTimersByTimeAsync(300); await flushPromises()
    rejectOld(new Error('Obsolete query failed')); await flushPromises()
    expect(wrapper.get('.map-canvas').attributes('aria-busy')).toBe('true')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    finishNew(response(['new-area'])); await flushPromises()
    expect(wrapper.get('.map-canvas').attributes('aria-busy')).toBe('false')
    expect(wrapper.getComponent({ name: 'MapView' }).props('discoveryPets').map((item: { id: string }) => item.id)).toEqual(['new-area'])
  } finally { wrapper.unmount(); vi.useRealTimers() }
})

it('keeps the current request and committed results across layout resize, searching resized bounds only explicitly', async () => {
  vi.useFakeTimers()
  let complete!: (value: unknown) => void
  api.getMapPets.mockResolvedValueOnce({ ...response(['initial']), insights: insights(201) })
  api.getMapPets.mockReturnValueOnce(new Promise(resolve => { complete = resolve }))
  const wrapper = render()
  try {
    await flushPromises()
    const map = wrapper.getComponent({ name: 'MapView' })
    const searched = { west: 114.1, east: 114.3, south: 22.3, north: 22.5 }
    const resized = { ...searched, north: 22.45 }
    map.vm.$emit('view-change', { lat: 22.4, lng: 114.2, zoom: 14, bounds: searched })
    await vi.advanceTimersByTimeAsync(300)
    const signal = api.getMapPets.mock.calls[1][1] as AbortSignal
    map.vm.$emit('view-change', { lat: 22.4, lng: 114.2, zoom: 14, bounds: resized, reason: 'resize' })
    await vi.advanceTimersByTimeAsync(350)
    expect(api.getMapPets).toHaveBeenCalledTimes(2)
    expect(signal.aborted).toBe(false)
    complete({ ...response(['searched']), insights: insights(9) }); await flushPromises()
    expect(map.props('discoveryPets').map((item: { id: string }) => item.id)).toEqual(['searched'])
    expect(wrapper.getComponent({ name: 'AreaInsightsCard' }).props('insights').total).toBe(9)
    expect(wrapper.get('.search-area').attributes('disabled')).toBeUndefined()
    await wrapper.get('.search-area').trigger('click'); await flushPromises()
    expect(api.getMapPets.mock.calls.at(-1)?.[0]).toEqual({ ...resized, page: 1, limit: 100 })
  } finally { wrapper.unmount(); vi.useRealTimers() }
})

it('cancels superseded pans, settles a latest-area failure and retries markers and insights together', async () => {
  vi.useFakeTimers()
  let completeOld!: (value: unknown) => void, failLatest!: (reason: unknown) => void
  api.getMapPets.mockResolvedValueOnce(response(['initial']))
  api.getMapPets.mockReturnValueOnce(new Promise(resolve => { completeOld = resolve }))
  api.getMapPets.mockReturnValueOnce(new Promise((_resolve, reject) => { failLatest = reject }))
  const wrapper = render()
  try {
    await flushPromises()
    const map = wrapper.getComponent({ name: 'MapView' })
    const first = { west: 114.1, east: 114.3, south: 22.3, north: 22.5 }
    const latest = { ...first, east: 114.2 }
    map.vm.$emit('view-change', { lat: 22.4, lng: 114.2, zoom: 14, bounds: first })
    await vi.advanceTimersByTimeAsync(300)
    const oldSignal = api.getMapPets.mock.calls[1][1] as AbortSignal
    map.vm.$emit('view-change', { lat: 22.4, lng: 114.15, zoom: 15, bounds: latest })
    await vi.advanceTimersByTimeAsync(300)
    expect(oldSignal.aborted).toBe(true)
    completeOld({ ...response(['obsolete']), insights: insights(999) }); await flushPromises()
    expect(wrapper.get('.map-canvas').attributes('aria-busy')).toBe('true')
    failLatest(new Error('Latest area unavailable')); await flushPromises()
    expect(wrapper.get('.map-canvas').attributes('aria-busy')).toBe('false')
    expect(wrapper.get('.search-area').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('.map-heading button').attributes('disabled')).toBeUndefined()
    expect(map.props('discoveryPets')).toEqual([])
    expect(wrapper.getComponent({ name: 'AreaInsightsCard' }).props('insights')).toBeNull()
    api.getMapPets.mockResolvedValueOnce({ ...response(['retry']), insights: insights(3) })
    await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
    expect(api.getMapPets.mock.calls.at(-1)?.[0]).toEqual({ ...latest, page: 1, limit: 100 })
    expect(map.props('discoveryPets').map((item: { id: string }) => item.id)).toEqual(['retry'])
    expect(wrapper.getComponent({ name: 'AreaInsightsCard' }).props('insights').total).toBe(3)
  } finally { wrapper.unmount(); vi.useRealTimers() }
})
