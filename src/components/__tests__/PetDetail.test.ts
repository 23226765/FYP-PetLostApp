import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pet, Sighting } from '../../types/pet'
import PetDetail from '../PetDetail.vue'

const apiMocks = vi.hoisted(() => ({
  getPetSightings: vi.fn(),
  confirmSighting: vi.fn(),
  updatePetStatus: vi.fn(),
}))

vi.mock('../../services/api', () => apiMocks)

const maple: Pet = {
  id: 'maple-id',
  name: 'Maple',
  species: 'Dog',
  breed: 'Golden Retriever',
  photo: '',
  description: '',
  owner: 'FYP Owner',
  ownerPhone: '',
  canViewContact: false,
  reportedBy: 'owner-id',
  status: 'lost',
  location: 'Sha Tin Park',
  lastSeen: 'Today',
  postedAgo: 'Today',
  coordinates: [114.188, 22.381],
  locationPrecision: 'exact',
  mapX: 50,
  mapY: 50,
}

const sighting: Sighting = {
  id: 'sighting-id',
  petId: maple.id,
  coordinates: [114.19, 22.382],
  locationPrecision: 'exact',
  locationName: 'Exact fountain entrance',
  note: 'Near the fountain',
  createdAt: '2026-09-18T08:00:00.000Z',
  reporterName: 'FYP Finder',
  reporterPhone: '+852 5555 0102',
  canViewContact: true,
}

describe('PetDetail sighting history', () => {
  beforeEach(() => apiMocks.getPetSightings.mockReset())

  it('renders one timeline entry per MongoDB id and keeps owner-only contact data', async () => {
    apiMocks.getPetSightings.mockResolvedValue([sighting, { ...sighting }])
    const wrapper = mount(PetDetail, {
      props: {
        pet: maple,
        user: { id: 'owner-id', name: 'FYP Owner', email: 'fyp.owner@pawradar.test' },
      },
      global: {
        stubs: {
          MapView: { template: '<div class="map-stub" />' },
          AppIcon: { template: '<span />' },
        },
      },
    })
    await flushPromises()

    expect(wrapper.findAll('.timeline-item')).toHaveLength(1)
    expect(wrapper.get('.timeline-item').attributes('id')).toBe('sighting-sighting-id')
    expect(wrapper.text()).toContain('FYP Finder')
  })

  it('renders only in-app Message when the owner contact is private', async () => {
    apiMocks.getPetSightings.mockResolvedValue([])
    const privatePet: Pet = { ...maple, ownerPhone: undefined, canViewContact: false }
    const wrapper = mount(PetDetail, {
      props: {
        pet: privatePet,
        user: { id: 'finder-id', name: 'Finder', email: 'finder@example.test' },
      },
      global: {
        stubs: {
          MapView: { template: '<div />' },
          AppIcon: { template: '<span />' },
        },
      },
    })
    await flushPromises()

    expect(wrapper.get('.contact-action.message').text()).toBe('Message')
    expect(wrapper.find('a[href^="tel:"]').exists()).toBe(false)
    expect(wrapper.find('a[href^="https://wa.me/"]').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('+852 5000 0101')
    expect(wrapper.props('pet').ownerPhone).toBeUndefined()
  })

  it('keeps an emergency post visible but hides contact actions for a blocked relationship', async () => {
    apiMocks.getPetSightings.mockResolvedValue([])
    const wrapper = mount(PetDetail, {
      props: {
        pet: { ...maple, interactionBlocked: true, ownerPhone: '+852 5000 0000', canViewContact: false },
        user: { id: 'finder-id', name: 'Finder', email: 'finder@example.test' },
      },
      global: { stubs: { MapView: { template: '<div />' }, AppIcon: { template: '<span />' } } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Maple')
    expect(wrapper.find('.contact-action.message').exists()).toBe(false)
    expect(wrapper.find('a[href^="tel:"]').exists()).toBe(false)
  })

  it('renders correct Call and WhatsApp links only while contact remains permitted', async () => {
    apiMocks.getPetSightings.mockResolvedValue([])
    const visiblePet: Pet = {
      ...maple,
      ownerPhone: '+852 5000 0101',
      canViewContact: true,
    }
    const wrapper = mount(PetDetail, {
      props: {
        pet: visiblePet,
        user: { id: 'finder-id', name: 'Finder', email: 'finder@example.test' },
      },
      global: {
        stubs: {
          MapView: { template: '<div />' },
          AppIcon: { template: '<span />' },
        },
      },
    })
    await flushPromises()

    expect(wrapper.get('a[href^="tel:"]').attributes('href')).toBe('tel:+85250000101')
    expect(wrapper.get('a[href^="https://wa.me/"]').attributes('href')).toContain(
      'https://wa.me/85250000101',
    )
    expect(wrapper.get('.contact-action.message').text()).toBe('Message')

    await wrapper.setProps({
      pet: { ...visiblePet, ownerPhone: undefined, canViewContact: false },
    })
    await flushPromises()
    expect(wrapper.find('a[href^="tel:"]').exists()).toBe(false)
    expect(wrapper.find('a[href^="https://wa.me/"]').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('+852 5000 0101')
  })

  it('clears exact sighting state immediately when the authenticated account changes', async () => {
    let resolveApproximate: ((value: Sighting[]) => void) | undefined
    const approximateRequest = new Promise<Sighting[]>((resolve) => {
      resolveApproximate = resolve
    })
    apiMocks.getPetSightings
      .mockResolvedValueOnce([sighting])
      .mockReturnValueOnce(approximateRequest)

    const wrapper = mount(PetDetail, {
      props: {
        pet: maple,
        user: { id: 'owner-id', name: 'FYP Owner', email: 'fyp.owner@pawradar.test' },
      },
      global: {
        stubs: {
          MapView: { template: '<div class="map-stub" />' },
          AppIcon: { template: '<span />' },
        },
      },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Exact fountain entrance')
    expect(wrapper.text()).toContain('FYP Finder')

    await wrapper.setProps({
      user: { id: 'unrelated-id', name: 'Other User', email: 'other@example.test' },
    })
    expect(wrapper.findAll('.timeline-item')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('Exact fountain entrance')
    expect(wrapper.text()).not.toContain('FYP Finder')

    resolveApproximate?.([{
      id: sighting.id,
      petId: maple.id,
      coordinates: [114.187, 22.379],
      locationName: 'Sha Tin',
      locationPrecision: 'approximate',
      note: 'Near the fountain',
      createdAt: sighting.createdAt,
      canViewContact: false,
    }])
    await flushPromises()
    expect(wrapper.findAll('.timeline-item')).toHaveLength(1)
    expect(wrapper.text()).toContain('Sha Tin')
    expect(wrapper.text()).not.toContain('FYP Finder')
  })
})
