import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { Pet } from '../../types/pet'
import type { User } from '../../types/user'
import ProfileScreen from '../ProfileScreen.vue'

const apiMocks = vi.hoisted(() => ({
  getMyPets: vi.fn(),
  getMySightings: vi.fn(),
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
    lastSeen: 'Today',
    postedAgo: 'Today',
    mapX: 50,
    mapY: 50,
  }
}

async function mountProfile(pets: Pet[], user = owner) {
  apiMocks.getMyPets.mockResolvedValue(pets)
  apiMocks.getMySightings.mockResolvedValue([])
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/profile', name: 'profile', component: { template: '<div />' } },
      { path: '/pets/:id', name: 'pet-detail', component: { template: '<div />' } },
      { path: '/settings', name: 'settings', component: { template: '<div />' } },
    ],
  })
  await router.push('/profile')
  await router.isReady()
  const wrapper = mount(ProfileScreen, { props: { user }, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('ProfileScreen My pets navigation', () => {
  beforeEach(() => {
    apiMocks.getMyPets.mockReset()
    apiMocks.getMySightings.mockReset()
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
})
