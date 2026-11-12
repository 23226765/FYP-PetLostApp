import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pet, Sighting } from '../../types/pet'
import PetDetail from '../PetDetail.vue'
import ContentImageEditor from '../ContentImageEditor.vue'
import { i18n } from '../../i18n'
import { formatDateTime } from '../../i18n/formatters'

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
  beforeEach(() => { apiMocks.getPetSightings.mockReset(); apiMocks.confirmSighting.mockReset(); i18n.global.locale.value = 'en' })

  it('uses a genuinely attached photos entry when the primary photo is absent or a seed graphic', async () => {
    apiMocks.getPetSightings.mockResolvedValue([])
    const wrapper = mount(PetDetail, { props: { pet: { ...maple, photo: 'https://placehold.co/800x600?text=Demo', photos: ['/test-photos/dog.jpg'] }, user: null }, global: { stubs: { MapView: true, AppIcon: true, SafetyActions: true } } })
    try {
      await flushPromises()
      expect(wrapper.get('.hero img').attributes('src')).toContain('/test-photos/dog.jpg')
      expect(wrapper.find('.hero-placeholder').exists()).toBe(false)
    } finally { wrapper.unmount() }
  })

  it.each(['en', 'zh-HK', 'zh-CN'] as const)('shows the permitted area first, then time, with separate approximation and moderation labels in %s', async language => {
    i18n.global.locale.value = language
    const publicSighting = { ...sighting, locationName: 'Sha Tin', locationPrecision: 'approximate' as const, reporterPhone: undefined, canViewContact: false }
    apiMocks.getPetSightings.mockResolvedValue([publicSighting])
    const wrapper = mount(PetDetail, { props: { pet: maple, user: null }, global: { stubs: { MapView: true, AppIcon: true } } })
    await flushPromises()
    const summary = wrapper.get('.sighting-summary')
    expect(summary.element.firstElementChild?.querySelector('strong')?.textContent).toBe('Sha Tin')
    expect(summary.get('.sighting-precision').text()).toBe(i18n.global.t('feedUsability.approximate'))
    expect(summary.get('time').text()).toBe(formatDateTime(sighting.createdAt, 'Asia/Hong_Kong'))
    expect(summary.get('time').attributes('datetime')).toBe(sighting.createdAt)
    expect(summary.findAll('dt')).toHaveLength(0)
    expect(wrapper.get('.sighting-note').text()).toBe('Near the fountain')
    expect(wrapper.get('.timeline-content .safety-link').text()).toBe(i18n.global.t('feedUsability.reportThisSighting'))
    expect(wrapper.get('.history-report').text()).toBe(i18n.global.t('feedUsability.reportSighting'))
    expect(wrapper.get('.confirm-button').text()).toContain(i18n.global.t('sightings.sawToo'))
    expect(wrapper.find('a[href^="tel:"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Exact fountain entrance')
    expect(wrapper.text()).not.toContain('+852 5555 0102')
    wrapper.unmount()
  })

  it.each([undefined, '', '   ', 'https://placehold.co/400x300?text=Demo'])('omits empty evidence and thumbnail tiles for a missing or demo photo (%s)', async photo => {
    apiMocks.getPetSightings.mockResolvedValue([{ ...sighting, note: '   ', photo }])
    const wrapper = mount(PetDetail, { props: { pet: maple, user: null }, global: { stubs: { MapView: true, AppIcon: true, SafetyActions: true } } })
    try {
      await flushPromises()
      expect(wrapper.get('.sighting-area').text()).toBe(sighting.locationName)
      expect(wrapper.find('.sighting-precision').exists()).toBe(false)
      expect(wrapper.find('.sighting-evidence').exists()).toBe(false)
      expect(wrapper.find('.sighting-thumbnail').exists()).toBe(false)
      expect(wrapper.find('.timeline-content .photo-placeholder').exists()).toBe(false)
      expect(wrapper.find('.confirm-button').exists()).toBe(true)
    } finally { wrapper.unmount() }
  })

  it('removes a failed thumbnail without leaving a tile and preserves the available note', async () => {
    apiMocks.getPetSightings.mockResolvedValue([{ ...sighting, photo: '/test-photos/sighting.jpg' }])
    const wrapper = mount(PetDetail, { props: { pet: maple, user: null }, global: { stubs: { MapView: true, AppIcon: true, SafetyActions: true } } })
    try {
      await flushPromises()
      expect(wrapper.get('.sighting-thumbnail img').attributes('src')).toContain('/test-photos/sighting.jpg')
      await wrapper.get('.sighting-thumbnail img').trigger('error')
      expect(wrapper.find('.sighting-thumbnail').exists()).toBe(false)
      expect(wrapper.find('.timeline-content .photo-placeholder').exists()).toBe(false)
      expect(wrapper.get('.sighting-note').text()).toBe(sighting.note)
    } finally { wrapper.unmount() }
  })

  it('keeps the reporter photo editor without a thumbnail and displays a later explicit replacement', async () => {
    apiMocks.getPetSightings.mockResolvedValue([{ ...sighting, note: undefined, photo: undefined, reportedBy: 'finder-id' }])
    const wrapper = mount(PetDetail, { props: { pet: maple, user: { id: 'finder-id', name: 'Finder', email: 'finder@example.test' } }, global: { stubs: { MapView: true, AppIcon: true, SafetyActions: true, ContentImageEditor: true } } })
    try {
      await flushPromises()
      const editor = wrapper.getComponent(ContentImageEditor)
      expect(editor.props()).toMatchObject({ type: 'sighting', id: sighting.id })
      expect(wrapper.find('.sighting-evidence').exists()).toBe(false)
      editor.vm.$emit('updated', [{ url: '/test-photos/replaced.jpg' }])
      await flushPromises()
      expect(wrapper.get('.sighting-thumbnail img').attributes('src')).toContain('/test-photos/replaced.jpg')
      expect(wrapper.find('.sighting-note').exists()).toBe(false)
      await wrapper.setProps({ user: { id: 'other-id', name: 'Other', email: 'other@example.test' } })
      await flushPromises()
      expect(wrapper.findComponent(ContentImageEditor).exists()).toBe(false)
    } finally { wrapper.unmount() }
  })

  it('keeps confirmation counts and disables another confirmation after I saw this too succeeds', async () => {
    apiMocks.getPetSightings.mockResolvedValue([{ ...sighting, confirmationCount: 2, confirmedByMe: false }])
    apiMocks.confirmSighting.mockResolvedValue({ confirmationCount: 3, confirmedByMe: true })
    const wrapper = mount(PetDetail, { props: { pet: maple, user: { id: 'finder-id', name: 'Finder', email: 'finder@example.test' } }, global: { stubs: { MapView: true, AppIcon: true, SafetyActions: true } } })
    try {
      await flushPromises()
      expect(wrapper.get('.confirmation-count').text()).toBe(i18n.global.t('sightings.confirmations', { count: 2 }, 2))
      await wrapper.get('.confirm-button').trigger('click')
      await flushPromises()
      expect(apiMocks.confirmSighting).toHaveBeenCalledExactlyOnceWith(maple.id, sighting.id)
      expect(wrapper.get('.confirmation-count').text()).toBe(i18n.global.t('sightings.confirmations', { count: 3 }, 3))
      expect(wrapper.get('.confirm-button').attributes('aria-pressed')).toBe('true')
      expect(wrapper.get('.confirm-button').attributes('disabled')).toBeDefined()
      expect(wrapper.get('.confirm-button').text()).toContain(i18n.global.t('sightings.confirmed'))
    } finally { wrapper.unmount() }
  })

  it('focuses the existing history entry point without opening the report form or adding a request', async () => {
    const scroll = vi.fn()
    const previous = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scroll
    apiMocks.getPetSightings.mockResolvedValue([])
    const wrapper = mount(PetDetail, { attachTo: document.body, props: { pet: maple, user: null, focusSightings: true }, global: { stubs: { MapView: true, AppIcon: true } } })
    try {
      await flushPromises()
      expect(document.activeElement).toBe(wrapper.get('#sighting-history-title').element)
      expect(scroll).toHaveBeenCalledWith({ block: 'start' })
      expect(apiMocks.getPetSightings).toHaveBeenCalledTimes(1)
      expect(wrapper.emitted('found')).toBeUndefined()
      await wrapper.get('.history-report').trigger('click')
      expect(wrapper.emitted('found')).toHaveLength(1)
      expect(apiMocks.getPetSightings).toHaveBeenCalledTimes(1)
    } finally { wrapper.unmount(); HTMLElement.prototype.scrollIntoView = previous }
  })

  it('does not cancel nested confirmation keyboard actions while keeping timeline keyboard focus', async () => {
    apiMocks.getPetSightings.mockResolvedValue([sighting])
    const wrapper = mount(PetDetail, { props: { pet: maple, user: null }, global: { stubs: { MapView: true, AppIcon: true, SafetyActions: true } } })
    await flushPromises()
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    wrapper.get('.confirm-button').element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    await wrapper.get('.timeline-item').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(wrapper.get('.timeline-item').classes()).toContain('focused')
    wrapper.unmount()
  })

  it.each([undefined, null, NaN, Infinity, -1, '2'])('omits an unavailable/invalid distance (%s), including its icon', async distance => {
    apiMocks.getPetSightings.mockResolvedValue([])
    const wrapper = mount(PetDetail, {
      props: { pet: { ...maple, distanceKm: distance as number | undefined }, user: null },
      global: { stubs: { MapView: true, AppIcon: true, ContentImageEditor: true } },
    })
    await flushPromises()
    expect(wrapper.find('.title-row .distance').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each(['en', 'zh-HK', 'zh-CN'] as const)('keeps zero and approximate-distance wording in %s without deriving coordinates', async language => {
    i18n.global.locale.value = language
    apiMocks.getPetSightings.mockResolvedValue([])
    const value = { ...maple, distanceKm: 0, locationPrecision: 'approximate' as const }
    const wrapper = mount(PetDetail, { props: { pet: value, user: null }, global: { stubs: { MapView: true, AppIcon: true, ContentImageEditor: true } } })
    expect(wrapper.get('.title-row .distance').text()).toBe(i18n.global.t('feedDesign.approxDistance', { distance: i18n.global.t('common.kilometres', { count: 0 }) }))
    await wrapper.setProps({ pet: { ...value, distanceKm: 2, locationPrecision: 'exact' } })
    expect(wrapper.get('.title-row .distance').text()).toBe(i18n.global.t('radar.distanceAway', { distance: 2 }))
    expect(value.coordinates).toEqual(maple.coordinates)
    wrapper.unmount()
  })

  it.each(['lost', 'sighted'] as const)('owner can reunite a %s pet and further sightings are disabled', async (status) => {
    apiMocks.getPetSightings.mockResolvedValue([])
    apiMocks.updatePetStatus.mockResolvedValue({ ...maple, status: 'reunited' })
    const wrapper = mount(PetDetail, {
      props: { pet: { ...maple, status }, user: { id: 'owner-id', name: 'Owner', email: 'owner@example.test' } },
      global: { stubs: { MapView: true, AppIcon: true, ContentImageEditor: true } },
    })
    await flushPromises()
    await wrapper.get('.reunited-cta').trigger('click')
    expect(wrapper.get('[role="dialog"]').text()).toContain('Has your pet')
    await wrapper.get('.confirm-reunion').trigger('click'); await flushPromises()
    expect(apiMocks.updatePetStatus).toHaveBeenCalledWith(maple.id, 'reunited')
    expect(wrapper.find('.reunited-cta').exists()).toBe(false)
    expect(wrapper.get('.found-cta').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.found-cta').classes()).toContain('sightings-closed')
    expect(wrapper.emitted('status-updated')?.[0]).toEqual([{ ...maple, status: 'reunited' }])
    wrapper.unmount()
  })

  it('unrelated users have no reunion control even when a pet is sighted', async () => {
    apiMocks.getPetSightings.mockResolvedValue([])
    const wrapper = mount(PetDetail, {
      props: { pet: { ...maple, status: 'sighted' }, user: { id: 'unrelated', name: 'Unrelated', email: 'other@example.test' } },
      global: { stubs: { MapView: true, AppIcon: true } },
    })
    await flushPromises()
    expect(wrapper.find('.reunited-cta').exists()).toBe(false)
    wrapper.unmount()
  })

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
