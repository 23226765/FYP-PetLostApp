import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Pet, Sighting } from '../../types/pet'
import PetDetail from '../PetDetail.vue'
import ContentImageEditor from '../ContentImageEditor.vue'
import SafetyActions from '../SafetyActions.vue'
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
  canEdit: false,
}

const statefulImageEditor = defineComponent({
  name: 'ContentImageEditor',
  props: ['type', 'id'],
  emits: ['updated'],
  setup() { return { draft: ref('') } },
  template: '<div class="editor-state"><input v-model="draft" aria-label="Replacement image draft" /></div>',
})

describe('PetDetail sighting history', () => {
  beforeEach(() => { apiMocks.getPetSightings.mockReset(); apiMocks.confirmSighting.mockReset(); i18n.global.locale.value = 'en' })

  it.each(['en', 'zh-HK', 'zh-CN'] as const)('keeps complete long location and owner text in both themed cards in %s', async language => {
    i18n.global.locale.value = language
    apiMocks.getPetSightings.mockResolvedValue([])
    const location = 'Fictional Hong Kong park entrance — 虛構公園東面行人通道及長地標說明'
    const owner = 'Fictional Owner With A Long Display Name 虛構寵物主人'
    const wrapper = mount(PetDetail, { props: { pet: { ...maple, location, owner, district: 'Sha Tin', distanceKm: 2 }, user: { id: 'reader', name: 'Reader', email: 'reader@example.test' } }, global: { stubs: { MapView: true, AppIcon: true, SafetyActions: true } } })
    try {
      await flushPromises()
      for (const theme of ['light', 'dark']) {
        document.documentElement.dataset.theme = theme
        expect(wrapper.get('.facts .fact:nth-child(2) .value').text()).toBe(location)
        expect(wrapper.get('.facts .fact:nth-child(2) .label').text()).toBe(i18n.global.t('pets.locationLabel'))
        expect(wrapper.get('.owner-name').text()).toBe(owner)
        expect(wrapper.get('.contact-unavailable').text()).toBe(i18n.global.t('pets.messagesOnly'))
        expect(wrapper.get('.contact-action.message').text()).toBe(i18n.global.t('messages.message'))
        expect(wrapper.find('a[href^="tel:"]').exists()).toBe(false)
        expect(wrapper.find('.title-row .distance').exists()).toBe(true)
      }
      // jsdom checks content retention; the compiled CSS tests cover wrapping rules, not rendered phone geometry.
    } finally { wrapper.unmount(); delete document.documentElement.dataset.theme }
  })

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
    const publicSighting = { ...sighting, locationName: 'Sha Tin', locationPrecision: 'approximate' as const }
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
    expect(wrapper.get('.sighting-menu > summary').attributes('aria-label')).toBe(i18n.global.t('sightingPrivacy.options'))
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

  it.each(['en', 'zh-HK', 'zh-CN'] as const)('keeps the submitter photo editor in the menu and displays a later explicit replacement in %s', async language => {
    i18n.global.locale.value = language
    apiMocks.getPetSightings.mockResolvedValueOnce([{ ...sighting, note: undefined, photo: undefined, canEdit: true }]).mockResolvedValueOnce([{ ...sighting, canEdit: false }])
    const wrapper = mount(PetDetail, { props: { pet: maple, user: { id: 'finder-id', name: 'Finder', email: 'finder@example.test' } }, global: { stubs: { MapView: true, AppIcon: true, SafetyActions: true, ContentImageEditor: true } } })
    try {
      await flushPromises()
      const editor = wrapper.getComponent(ContentImageEditor)
      expect(editor.props()).toMatchObject({ type: 'sighting', id: sighting.id })
      expect(editor.element.closest('.sighting-menu')?.tagName).toBe('DETAILS')
      expect(wrapper.get('.your-sighting').text()).toBe(i18n.global.t('sightingPrivacy.yourSighting'))
      expect(wrapper.get('.sighting-menu .sharing-warning').text()).toBe(i18n.global.t('sightingPrivacy.sharingWarning'))
      expect(wrapper.find('.sighting-evidence').exists()).toBe(false)
      editor.vm.$emit('updated', [{ url: '/test-photos/replaced.jpg' }])
      await flushPromises()
      expect(wrapper.get('.sighting-thumbnail img').attributes('src')).toContain('/test-photos/replaced.jpg')
      expect(wrapper.find('.sighting-note').exists()).toBe(false)
      await wrapper.setProps({ user: { id: 'other-id', name: 'Other', email: 'other@example.test' } })
      await flushPromises()
      expect(wrapper.findComponent(ContentImageEditor).exists()).toBe(false)
      expect(wrapper.find('.your-sighting').exists()).toBe(false)
    } finally { wrapper.unmount() }
  })

  it.each([undefined, 0])('omits an empty confirmation count (%s) while keeping I saw this too available', async confirmationCount => {
    apiMocks.getPetSightings.mockResolvedValue([{ ...sighting, confirmationCount }])
    const wrapper = mount(PetDetail, { props: { pet: maple, user: null }, global: { stubs: { MapView: true, AppIcon: true, SafetyActions: true } } })
    try {
      await flushPromises()
      expect(wrapper.find('.confirmation-count').exists()).toBe(false)
      expect(wrapper.get('.confirm-button').text()).toContain(i18n.global.t('sightings.sawToo'))
      expect(wrapper.get('.confirm-button').element.closest('.sighting-menu')).toBeNull()
    } finally { wrapper.unmount() }
  })

  it.each(['owner-id', 'unrelated-id'])('keeps %s anonymous sighting evidence access separate from editing rights', async id => {
    const legacySighting = {
      ...sighting,
      photo: id === 'owner-id' ? '/test-photos/sighting.jpg' : undefined,
      note: id === 'owner-id' ? sighting.note : undefined,
      reportedBy: 'legacy-finder-id',
      reporterName: 'FYP Finder',
      reporterPhone: '+852 5555 0102',
      canViewContact: true,
    }
    apiMocks.getPetSightings.mockResolvedValue([legacySighting])
    const wrapper = mount(PetDetail, {
      props: { pet: maple, user: { id, name: 'Reader', email: 'reader@example.test' } },
      global: { stubs: { MapView: true, AppIcon: true, SafetyActions: true, ContentImageEditor: true } },
    })
    try {
      await flushPromises()
      const entry = wrapper.get('.timeline-content')
      if (id === 'owner-id') {
        expect(entry.get('.sighting-note').text()).toBe(sighting.note)
        expect(entry.get('.sighting-thumbnail img').attributes('src')).toContain('/test-photos/sighting.jpg')
      } else {
        expect(entry.find('.sighting-note').exists()).toBe(false)
        expect(entry.find('.sighting-thumbnail').exists()).toBe(false)
      }
      expect(entry.findComponent(ContentImageEditor).exists()).toBe(false)
      expect(entry.find('.your-sighting').exists()).toBe(false)
      expect(entry.find('.reporter-details').exists()).toBe(false)
      expect(entry.find('.reporter-actions').exists()).toBe(false)
      expect(entry.find('a[href^="tel:"]').exists()).toBe(false)
      expect(entry.find('a[href^="https://wa.me/"]').exists()).toBe(false)
      expect(entry.text()).not.toContain('FYP Finder')
      expect(entry.text()).not.toContain('+852 5555 0102')
      expect(entry.text()).not.toContain('legacy-finder-id')
      expect(entry.text()).not.toContain(i18n.global.t('sightings.reportedBy', { name: 'FYP Finder' }))
      expect(entry.text()).not.toContain(i18n.global.t('sightings.messageReporter'))
      expect(entry.text()).not.toContain(i18n.global.t('sightings.callReporter'))
      expect(wrapper.emitted('chat-reporter')).toBeUndefined()
    } finally { wrapper.unmount() }
  })

  it.each([false, undefined, 1, 'true'])('requires explicit canEdit=true even when a legacy reporter id matches (%s)', async canEdit => {
    apiMocks.getPetSightings.mockResolvedValue([{ ...sighting, canEdit, reportedBy: 'finder-id' }])
    const wrapper = mount(PetDetail, {
      props: { pet: maple, user: { id: 'finder-id', name: 'Finder', email: 'finder@example.test' } },
      global: { stubs: { MapView: true, AppIcon: true, SafetyActions: true, ContentImageEditor: true } },
    })
    try {
      await flushPromises()
      expect(wrapper.find('.sighting-menu .sighting-photo-editor').exists()).toBe(false)
      expect(wrapper.find('.your-sighting').exists()).toBe(false)
    } finally { wrapper.unmount() }
  })

  it('requires a signed-in user before showing Your sighting or its editor', async () => {
    apiMocks.getPetSightings.mockResolvedValue([{ ...sighting, canEdit: true }])
    const wrapper = mount(PetDetail, { props: { pet: maple, user: null }, global: { stubs: { MapView: true, AppIcon: true, SafetyActions: true, ContentImageEditor: true } } })
    try {
      await flushPromises()
      expect(wrapper.findComponent(ContentImageEditor).exists()).toBe(false)
      expect(wrapper.find('.your-sighting').exists()).toBe(false)
    } finally { wrapper.unmount() }
  })

  it('keeps reporting a new sighting separate from the closed report-only moderation menu', async () => {
    apiMocks.getPetSightings.mockResolvedValue([sighting])
    const wrapper = mount(PetDetail, { props: { pet: maple, user: null }, global: { stubs: { MapView: true, AppIcon: true } } })
    try {
      await flushPromises()
      const menu = wrapper.get<HTMLDetailsElement>('.sighting-menu')
      expect(menu.element.tagName).toBe('DETAILS')
      expect(menu.element.open).toBe(false)
      expect(menu.get('summary').attributes('aria-label')).toBe(i18n.global.t('sightingPrivacy.options'))
      expect(menu.get('summary svg').attributes('aria-hidden')).toBe('true')
      const moderation = menu.getComponent(SafetyActions)
      expect(moderation.props()).toMatchObject({ targetType: 'sighting', targetId: sighting.id, reportOnly: true, reportLabel: i18n.global.t('feedUsability.reportThisSighting') })
      expect(menu.find('.history-report').exists()).toBe(false)
      expect(menu.find('.confirm-button').exists()).toBe(false)
      menu.get('summary').element.click()
      expect(menu.element.open).toBe(true)
      await moderation.get('.safety-link').trigger('click')
      expect(wrapper.emitted('auth-needed')).toHaveLength(1)
      expect(wrapper.emitted('found')).toBeUndefined()
      await wrapper.get('.history-report').trigger('click')
      expect(wrapper.emitted('found')).toHaveLength(1)
      expect(apiMocks.getPetSightings).toHaveBeenCalledTimes(1)
    } finally { wrapper.unmount() }
  })

  it('preserves native summary keyboard activation and closes the menu on Escape with focus restored', async () => {
    apiMocks.getPetSightings.mockResolvedValue([{ ...sighting, canEdit: true }])
    const wrapper = mount(PetDetail, {
      attachTo: document.body,
      props: { pet: maple, user: { id: 'finder-id', name: 'Finder', email: 'finder@example.test' } },
      global: { stubs: { MapView: true, AppIcon: true, SafetyActions: true, ContentImageEditor: statefulImageEditor } },
    })
    try {
      await flushPromises()
      const menu = wrapper.get<HTMLDetailsElement>('.sighting-menu')
      const summary = menu.get<HTMLElement>('summary')
      expect(summary.element.parentElement).toBe(menu.element)
      expect(summary.attributes('tabindex')).not.toBe('-1')
      for (const key of ['Tab', 'Enter']) {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
        summary.element.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
      }
      // jsdom has no native keyboard default actions; click exercises its details toggle.
      summary.element.click()
      expect(menu.element.open).toBe(true)
      const draft = menu.get<HTMLInputElement>('input')
      draft.element.focus()
      expect(document.activeElement).toBe(draft.element)
      await draft.trigger('keydown', { key: 'Escape' })
      expect(menu.element.open).toBe(false)
      expect(document.activeElement).toBe(summary.element)
    } finally { wrapper.unmount() }
  })

  it('closes the previous menu and discards its editor state immediately on account change', async () => {
    let resolveNext: ((value: Sighting[]) => void) | undefined
    const nextRequest = new Promise<Sighting[]>(resolve => { resolveNext = resolve })
    apiMocks.getPetSightings.mockResolvedValueOnce([{ ...sighting, canEdit: true }]).mockReturnValueOnce(nextRequest)
    const wrapper = mount(PetDetail, {
      attachTo: document.body,
      props: { pet: maple, user: { id: 'finder-id', name: 'Finder', email: 'finder@example.test' } },
      global: { stubs: { MapView: true, AppIcon: true, SafetyActions: true, ContentImageEditor: statefulImageEditor } },
    })
    try {
      await flushPromises()
      const oldMenu = wrapper.get<HTMLDetailsElement>('.sighting-menu')
      oldMenu.get('summary').element.click()
      await oldMenu.get('input').setValue('old private image draft')
      const oldEditor = wrapper.getComponent(statefulImageEditor)
      await wrapper.setProps({ user: { id: 'other-id', name: 'Other', email: 'other@example.test' } })
      expect(wrapper.find('.sighting-menu').exists()).toBe(false)
      expect(wrapper.find('.editor-state').exists()).toBe(false)
      expect(oldMenu.element.isConnected).toBe(false)
      resolveNext?.([{ ...sighting, canEdit: false, photo: '/test-photos/next-account.jpg' }])
      await flushPromises()
      oldEditor.vm.$emit('updated', [{ url: '/test-photos/stale.jpg' }])
      await flushPromises()
      expect(wrapper.get<HTMLDetailsElement>('.sighting-menu').element.open).toBe(false)
      expect(wrapper.find('.editor-state').exists()).toBe(false)
      expect(wrapper.find('.your-sighting').exists()).toBe(false)
      expect(wrapper.get('.sighting-thumbnail img').attributes('src')).toContain('/test-photos/next-account.jpg')
      expect(wrapper.html()).not.toContain('old private image draft')
      expect(wrapper.html()).not.toContain('/test-photos/stale.jpg')
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

  it('ignores an old account confirmation failure while the new account confirms the same entry', async () => {
    let rejectOld: ((error: Error) => void) | undefined
    let resolveNew: ((result: { confirmationCount: number; confirmedByMe: boolean }) => void) | undefined
    const oldConfirmation = new Promise<never>((_resolve, reject) => { rejectOld = reject })
    const newConfirmation = new Promise<{ confirmationCount: number; confirmedByMe: boolean }>(resolve => { resolveNew = resolve })
    apiMocks.getPetSightings.mockResolvedValueOnce([{ ...sighting }]).mockResolvedValueOnce([{ ...sighting }])
    apiMocks.confirmSighting.mockReturnValueOnce(oldConfirmation).mockReturnValueOnce(newConfirmation)
    const wrapper = mount(PetDetail, {
      props: { pet: maple, user: { id: 'first-id', name: 'First', email: 'first@example.test' } },
      global: { stubs: { MapView: true, AppIcon: true, SafetyActions: true } },
    })
    try {
      await flushPromises()
      await wrapper.get('.confirm-button').trigger('click')
      await wrapper.setProps({ user: { id: 'next-id', name: 'Next', email: 'next@example.test' } })
      await flushPromises()
      await wrapper.get('.confirm-button').trigger('click')
      rejectOld?.(new Error('Old account failed'))
      await flushPromises()
      expect(wrapper.find('.confirmation-error').exists()).toBe(false)
      expect(wrapper.get('.confirm-button').attributes('disabled')).toBeDefined()
      expect(wrapper.get('.confirm-button').text()).toContain(i18n.global.t('sightings.confirming'))
      resolveNew?.({ confirmationCount: 1, confirmedByMe: true })
      await flushPromises()
      expect(wrapper.get('.confirmation-count').text()).toBe(i18n.global.t('sightings.confirmations', { count: 1 }, 1))
      expect(wrapper.get('.confirm-button').attributes('aria-pressed')).toBe('true')
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

  it('renders one anonymous timeline entry per MongoDB id for the pet owner', async () => {
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
    expect(wrapper.text()).not.toContain('FYP Finder')
    expect(wrapper.get('.timeline-content').find('.reporter-details').exists()).toBe(false)
    wrapper.unmount()
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
    expect(wrapper.text()).not.toContain('FYP Finder')

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
      canEdit: false,
    }])
    await flushPromises()
    expect(wrapper.findAll('.timeline-item')).toHaveLength(1)
    expect(wrapper.text()).toContain('Sha Tin')
    expect(wrapper.text()).not.toContain('FYP Finder')
    wrapper.unmount()
  })
})
