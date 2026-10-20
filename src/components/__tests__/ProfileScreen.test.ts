import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Pet } from '../../types/pet'
import type { User } from '../../types/user'
import ProfileScreen from '../ProfileScreen.vue'

const apiMocks = vi.hoisted(() => ({
  getMyPetsPage: vi.fn(),
  getMySightings: vi.fn(),
  getMyStraysPage: vi.fn(),
  getSavedStraysPage: vi.fn(),
  setStraySaved: vi.fn(),
}))

vi.mock('../../services/api', () => apiMocks)

const owner: User = {
  id: 'owner-id',
  name: 'FYP Owner',
  email: 'fyp.owner@pawradar.test',
}

function pet(id: string, name: string): Pet {
  return {
    id,
    name,
    species: 'Dog',
    breed: 'Fictional breed',
    photo: 'https://example.test/pet.jpg',
    description: '',
    owner: owner.name,
    ownerPhone: '',
    canViewContact: false,
    status: 'lost',
    location: 'Sha Tin',
    locationPrecision: 'exact',
    lastSeen: 'Today',
    postedAgo: 'Today',
    mapX: 50,
    mapY: 50,
  }
}

const pagination = { page: 1, limit: 20, total: 1, totalPages: 1, hasMore: false }

function stray(id: string) {
  return {
    id, species: 'Dog' as const, animalType: '', description: 'Waiting near the park',
    photo: 'https://example.test/stray.jpg', photos: ['https://example.test/stray.jpg'],
    condition: 'healthy' as const, district: 'Sha Tin', location: 'Sha Tin Park',
    coordinates: [114.18, 22.38] as [number, number], rescueStatus: 'reported' as const,
    locationPrecision: 'exact' as const,
    reporterName: owner.name, author: { id: owner.id, name: owner.name, avatar: '' },
    canViewContact: false, reportedBy: owner.id, reportedAgo: 'Today',
    observedAt: '2026-09-20T10:00:00.000Z', createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-20T10:00:00.000Z', statusUpdatedAt: '2026-09-20T10:00:00.000Z',
    commentCount: 2, isSaved: true, canManage: true, canEdit: true, canDelete: true, canUpdateStatus: true,
  }
}

async function mountProfile(pets: Pet[], user = owner, initialRoute = '/profile') {
  apiMocks.getMyPetsPage.mockResolvedValue({
    pets,
    pagination: { ...pagination, total: pets.length },
    summary: { total: pets.length, reunited: 0, active: pets.length },
  })
  apiMocks.getMySightings.mockResolvedValue([])
  apiMocks.getMyStraysPage.mockResolvedValue({ strays: [stray('rescue-one')], pagination })
  apiMocks.getSavedStraysPage.mockResolvedValue({ strays: [stray('saved-one')], unavailableCount: 0, pagination })
  apiMocks.setStraySaved.mockResolvedValue(false)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/profile', name: 'profile', component: { template: '<div />' } },
      { path: '/pets/:id', name: 'pet-detail', component: { template: '<div />' } },
      { path: '/strays/:id', name: 'stray-detail', component: { template: '<div />' } },
      { path: '/settings', name: 'settings', component: { template: '<div />' } },
    ],
  })
  await router.push(initialRoute)
  await router.isReady()
  const wrapper = mount(ProfileScreen, { props: { user }, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('ProfileScreen My pets navigation', () => {
  beforeEach(() => {
    apiMocks.getMyPetsPage.mockReset()
    apiMocks.getMySightings.mockReset()
    apiMocks.getMyStraysPage.mockReset()
    apiMocks.getSavedStraysPage.mockReset()
    apiMocks.setStraySaved.mockReset()
  })

  it.each([
    ['maple-id', 'Maple'],
    ['pixel-id', 'Pixel'],
    ['comet-id', 'Comet'],
  ])('opens owner pet %s by unique id when clicked', async (id, name) => {
    const { wrapper, router } = await mountProfile([pet(id, name)])
    await wrapper.get('.my-pet').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('pet-detail')
    expect(router.currentRoute.value.params.id).toBe(id)
  })

  it('opens Nimbus for the finder account with the keyboard', async () => {
    const finder = { ...owner, id: 'finder-id', email: 'fyp.finder@pawradar.test' }
    const { wrapper, router } = await mountProfile([pet('nimbus-id', 'Nimbus')], finder)
    const card = wrapper.get('.my-pet')
    expect(card.attributes('role')).toBe('link')
    expect(card.attributes('tabindex')).toBe('0')
    await card.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(router.currentRoute.value.params.id).toBe('nimbus-id')
  })

  it('uses My pets by default and falls back to it for an invalid query', async () => {
    const { wrapper } = await mountProfile([pet('maple-id', 'Maple')], owner, '/profile?tab=invalid')
    expect(wrapper.get('#profile-tab-pets').attributes('aria-selected')).toBe('true')
    expect(wrapper.find('.my-pet').exists()).toBe(true)
  })

  it('loads authored rescue posts once and opens the canonical stray route', async () => {
    const { wrapper, router } = await mountProfile([], owner, '/profile?tab=rescue')
    expect(wrapper.get('#profile-tab-rescue').attributes('aria-selected')).toBe('true')
    expect(apiMocks.getMyStraysPage).toHaveBeenCalledTimes(1)
    await wrapper.get('.profile-stray-card').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('stray-detail')
    expect(router.currentRoute.value.params.id).toBe('rescue-one')
    router.back()
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('profile')
    expect(router.currentRoute.value.query.tab).toBe('rescue')
    expect(wrapper.get('#profile-tab-rescue').attributes('aria-selected')).toBe('true')
  })

  it('removes only the selected saved rescue post when unsaved', async () => {
    const { wrapper } = await mountProfile([], owner, '/profile?tab=saved')
    expect(wrapper.findAll('.profile-stray-card')).toHaveLength(1)
    // The real API no longer includes the unsaved record when page one refreshes.
    apiMocks.getSavedStraysPage.mockResolvedValueOnce({ strays: [], unavailableCount: 0, pagination: { ...pagination, total: 0 } })
    await wrapper.get('.unsave').trigger('click')
    await flushPromises()
    expect(apiMocks.setStraySaved).toHaveBeenCalledWith('saved-one', false)
    expect(apiMocks.getSavedStraysPage).toHaveBeenCalledTimes(2)
    expect(wrapper.findAll('.profile-stray-card')).toHaveLength(0)
  })

  it('does not refetch a loaded tab when switching away and back', async () => {
    const { wrapper } = await mountProfile([], owner)
    await wrapper.get('#profile-tab-rescue').trigger('click')
    await flushPromises()
    await wrapper.get('#profile-tab-saved').trigger('click')
    await flushPromises()
    await wrapper.get('#profile-tab-rescue').trigger('click')
    await flushPromises()
    expect(apiMocks.getMyStraysPage).toHaveBeenCalledTimes(1)
  })
})
