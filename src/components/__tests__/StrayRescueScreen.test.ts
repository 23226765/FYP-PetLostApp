import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { StrayReport } from '../../types/stray'
import StrayRescueScreen from '../StrayRescueScreen.vue'
import { i18n } from '../../i18n'

const apiMocks = vi.hoisted(() => ({
  getNearbyStrays: vi.fn(),
  reportStray: vi.fn(),
  setStraySaved: vi.fn(),
  uploadManagedImage: vi.fn(),
  discardManagedImage: vi.fn(),
}))
vi.mock('../../services/api', () => apiMocks)
vi.mock('@capacitor/camera', () => ({ Camera: { getPhoto: vi.fn().mockResolvedValue({ dataUrl: 'data:image/png;base64,AAAA' }) }, CameraResultType: { DataUrl: 'dataUrl' } }))

const stray: StrayReport = {
  id: 'stray-one', species: 'Cat', animalType: '', description: 'Calm ginger cat by the market',
  photo: 'https://example.test/cat.jpg', photos: ['https://example.test/cat.jpg'],
  condition: 'healthy', district: 'Wan Chai', location: 'Market entrance',
  coordinates: [114.17, 22.28], rescueStatus: 'reported', reporterName: 'Finder',
  locationPrecision: 'exact',
  author: { id: 'finder-id', name: 'Finder', avatar: '' }, canViewContact: false,
  reportedBy: 'finder-id', reportedAgo: '2m ago', observedAt: '2026-09-18T08:00:00.000Z',
  createdAt: '2026-09-18T08:00:00.000Z', updatedAt: '2026-09-18T08:00:00.000Z',
  statusUpdatedAt: '2026-09-18T08:00:00.000Z', commentCount: 2, isSaved: false, canManage: true, canEdit: true, canDelete: true, canUpdateStatus: true,
}

async function render(initial: StrayReport[] = [stray], pending?: Promise<StrayReport[]>) {
  apiMocks.getNearbyStrays.mockReturnValue(pending || Promise.resolve(initial))
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/strays/:id', component: { template: '<div />' } },
  ] })
  await router.push('/'); await router.isReady()
  const wrapper = mount(StrayRescueScreen, {
    props: { user: { id: 'finder-id', name: 'Finder', email: 'finder@example.test' }, radiusKm: 5, userLocation: { lat: 22.28, lng: 114.17 } },
    global: { plugins: [router], stubs: {
      AppIcon: { template: '<span />' },
      MapView: { props: ['strays'], template: '<div class="map-stub">{{ strays.length }}</div>' },
      SightingLocationPicker: { props: ['modelValue'], emits: ['update:modelValue'], template: '<button class="location-stub" type="button" @click="$emit(\'update:modelValue\', [114.18, 22.29])">Select location</button>' },
    } },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('Stray community feed and report flow', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'en'
    Object.values(apiMocks).forEach((mock) => mock.mockReset())
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
    HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  })

  it.each(['en', 'zh-HK', 'zh-CN'] as const)('renders counts and the specific animal name in %s', async locale => {
    i18n.global.locale.value = locale
    const { wrapper } = await render([{ ...stray, species: 'Other', animalType: 'Tiger', commentCount: 1 }])
    expect(wrapper.text()).toContain('Tiger')
    expect(wrapper.text()).toContain(i18n.global.t('strays.nearbyReports', { count: 1 }, 1))
    expect(wrapper.get('.card-foot').text()).toBe(i18n.global.t('strays.commentsCount', { count: 1 }, 1))
    if (locale === 'en') {
      expect(wrapper.text()).toContain('1 nearby report')
      expect(wrapper.get('.card-foot').text()).toBe('1 comment')
      expect(wrapper.text()).not.toContain('1 nearby reports')
    }
    wrapper.unmount()
    i18n.global.locale.value = 'en'
  })

  it('removes noninteractive skeletons once the existing rescue request completes', async () => {
    let finish!: (data: StrayReport[]) => void
    const pending = new Promise<StrayReport[]>(resolve => { finish = resolve })
    const { wrapper, router } = await render([], pending)
    expect(wrapper.findAll('.feed-skeleton')).toHaveLength(2)
    expect(wrapper.find('.feed-skeleton button').exists()).toBe(false)
    expect(router.currentRoute.value.path).toBe('/')
    finish([stray]); await flushPromises()
    expect(wrapper.find('.feed-skeleton').exists()).toBe(false)
    expect(wrapper.findAll('.stray-card')).toHaveLength(1)
    wrapper.unmount()
  })

  it('stages filters until Apply, resets them, and retains filters and Map selection while inactive', async () => {
    const { wrapper } = await render()
    await wrapper.get('.filter-trigger').trigger('click')
    const selects = wrapper.findAll('.filters select')
    await selects[0].setValue('Cat'); await selects[1].setValue('reported'); await selects[2].setValue('Wan Chai')
    expect(apiMocks.getNearbyStrays).toHaveBeenCalledTimes(1)
    await wrapper.get('.apply-filters').trigger('click'); await flushPromises()
    expect(apiMocks.getNearbyStrays).toHaveBeenCalledTimes(2)
    expect(apiMocks.getNearbyStrays.mock.calls.at(-1)?.[0]).toMatchObject({ species: 'Cat', status: 'reported', district: 'Wan Chai' })
    await wrapper.get('.view-toggle button:nth-child(2)').trigger('click')
    await wrapper.setProps({ active: false }); await wrapper.setProps({ active: true }); await flushPromises()
    expect(wrapper.find('.map-stub').exists()).toBe(true)
    expect(apiMocks.getNearbyStrays.mock.calls.at(-1)?.[0]).toMatchObject({ species: 'Cat', district: 'Wan Chai' })
    await wrapper.get('.reset-filters').trigger('click'); await flushPromises()
    expect(apiMocks.getNearbyStrays.mock.calls.at(-1)?.[0]).toMatchObject({ species: undefined, status: undefined, district: undefined })
    wrapper.unmount()
  })

  it('puts actions before the caption, retains multiple photos, and does not navigate from nested keyboard actions', async () => {
    apiMocks.setStraySaved.mockResolvedValue(true)
    const { wrapper, router } = await render([{ ...stray, photos: [stray.photo, 'https://example.test/cat-2.jpg'] }])
    const children = wrapper.get('.stray-card').element.children
    expect([...children].map(element => element.className)).toEqual(['post-author', 'photo-carousel', 'card-actions', 'card-body'])
    expect(wrapper.findAll('.photo-wrap')).toHaveLength(2)
    expect(wrapper.get('.photo-carousel').attributes('tabindex')).toBe('0')
    expect(wrapper.get('.photo-carousel').attributes('role')).toBe('region')
    expect(wrapper.find('.photo-wrap .condition').exists()).toBe(false)
    expect(wrapper.find('.photo-wrap .photo-position').exists()).toBe(false)
    const save = wrapper.findAll('.card-actions button')[1]
    await save.trigger('keydown', { key: 'Enter' }); await save.trigger('click'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
    expect(apiMocks.setStraySaved).toHaveBeenCalledTimes(1)
    await wrapper.findAll('.card-actions button')[2].trigger('click'); await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/strays/stray-one?share=1')
    wrapper.unmount()
  })

  it('Comment opens the existing detail without share intent; Save retains its pressed state', async () => {
    const { wrapper, router } = await render()
    await wrapper.findAll('.card-actions button')[0].trigger('keydown', { key: 'Enter' })
    await wrapper.findAll('.card-actions button')[0].trigger('click'); await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/strays/stray-one')
    expect(wrapper.findAll('.card-actions button')[1].attributes('aria-pressed')).toBe('false')
    wrapper.unmount()
  })

  it('makes the complete caption clearly accessible through the existing detail route', async () => {
    const { wrapper, router } = await render([{ ...stray, description: 'Fictional caption '.repeat(40) }])
    expect(wrapper.get('.caption-more').text()).toContain('View')
    await wrapper.get('.caption-more').trigger('keydown', { key: 'Enter' })
    expect(router.currentRoute.value.path).toBe('/')
    await wrapper.get('.caption-more').trigger('click'); await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/strays/stray-one')
    wrapper.unmount()
  })

  it('opens the canonical post route and preserves one filtered record across List/Map', async () => {
    const { wrapper, router } = await render()
    expect(wrapper.findAll('.stray-card')).toHaveLength(1)
    await wrapper.get('.stray-card').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/strays/stray-one')
  })

  it('persists a private bookmark through the API', async () => {
    apiMocks.setStraySaved.mockResolvedValue(true)
    const { wrapper } = await render()
    const saveButton = wrapper.findAll('.card-actions button')[1]
    await saveButton.trigger('click'); await flushPromises()
    expect(apiMocks.setStraySaved).toHaveBeenCalledWith('stray-one', true)
    expect(saveButton.text()).toContain('Saved')
  })

  it('uploads multipart bytes and submits only its image ID with confirmed lng/lat', async () => {
    localStorage.setItem('token', 'fictional-fixture-token')
    apiMocks.uploadManagedImage.mockResolvedValue({ id: '123456789012345678901234', url: '/api/uploads/managed/123456789012345678901234/preview' })
    apiMocks.reportStray.mockResolvedValue(stray)
    const { wrapper } = await render([])
    await wrapper.get('.report-button').trigger('click')
    await wrapper.get('.photo-button').trigger('click'); await flushPromises()
    await wrapper.get('.location-stub').trigger('click')
    const selects = wrapper.findAll('.report-sheet select')
    await selects[0].setValue('Cat'); await selects[1].setValue('healthy')
    await selects[2].setValue('Wan Chai')
    const textInput = wrapper.find('.report-sheet input[placeholder="Street, landmark, or park"]')
    await textInput.setValue('Market entrance')
    await wrapper.get('.report-sheet textarea').setValue('Calm ginger cat near the entrance')
    await wrapper.get('.report-sheet').trigger('submit'); await flushPromises()
    expect(apiMocks.uploadManagedImage).toHaveBeenCalledWith(expect.objectContaining({ size: 3, type: 'image/png' }), 'stray', expect.any(String), expect.objectContaining({ signal: expect.objectContaining({ aborted: false }) }))
    expect(apiMocks.reportStray).toHaveBeenCalledWith(expect.objectContaining({
      coordinates: [114.18, 22.29], imageIds: ['123456789012345678901234'],
    }))
  })

  it('requires and displays a specific animal type for the Other category', async () => {
    const parrot = { ...stray, id: 'stray-parrot', species: 'Other' as const, animalType: 'Parrot' }
    const { wrapper } = await render([parrot])
    expect(wrapper.get('.card-title strong').text()).toBe('Parrot')

    await wrapper.get('.report-button').trigger('click')
    const selects = wrapper.findAll('.report-sheet select')
    await selects[0].setValue('Other')
    const animalTypeInput = wrapper.get('.report-sheet input[maxlength="80"]')
    await animalTypeInput.setValue('Rabbit')
    expect((animalTypeInput.element as HTMLInputElement).value).toBe('Rabbit')
  })
})
