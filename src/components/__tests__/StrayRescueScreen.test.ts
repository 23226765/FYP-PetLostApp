import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { StrayReport } from '../../types/stray'
import StrayRescueScreen from '../StrayRescueScreen.vue'

const apiMocks = vi.hoisted(() => ({
  getNearbyStrays: vi.fn(),
  reportStray: vi.fn(),
  setStraySaved: vi.fn(),
  uploadImage: vi.fn(),
}))
vi.mock('../../services/api', () => apiMocks)
vi.mock('@capacitor/camera', () => ({ Camera: { getPhoto: vi.fn().mockResolvedValue({ dataUrl: 'data:image/png;base64,AAAA' }) }, CameraResultType: { DataUrl: 'dataUrl' } }))

const stray: StrayReport = {
  id: 'stray-one', species: 'Cat', animalType: '', description: 'Calm ginger cat by the market',
  photo: 'https://example.test/cat.jpg', photos: ['https://example.test/cat.jpg'],
  condition: 'healthy', district: 'Wan Chai', location: 'Market entrance',
  coordinates: [114.17, 22.28], rescueStatus: 'reported', reporterName: 'Finder',
  author: { id: 'finder-id', name: 'Finder', avatar: '' }, canViewContact: false,
  reportedBy: 'finder-id', reportedAgo: '2m ago', observedAt: '2026-09-18T08:00:00.000Z',
  createdAt: '2026-09-18T08:00:00.000Z', updatedAt: '2026-09-18T08:00:00.000Z',
  statusUpdatedAt: '2026-09-18T08:00:00.000Z', commentCount: 2, isSaved: false, canManage: true,
}

async function render(initial: StrayReport[] = [stray]) {
  apiMocks.getNearbyStrays.mockResolvedValue(initial)
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
  beforeEach(() => Object.values(apiMocks).forEach((mock) => mock.mockReset()))

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

  it('uploads the selected image and submits only its URL with confirmed lng/lat', async () => {
    apiMocks.uploadImage.mockResolvedValue('/uploads/stray.png')
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
    expect(apiMocks.uploadImage).toHaveBeenCalledWith('data:image/png;base64,AAAA')
    expect(apiMocks.reportStray).toHaveBeenCalledWith(expect.objectContaining({
      coordinates: [114.18, 22.29], photo: '/uploads/stray.png', photos: ['/uploads/stray.png'],
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
