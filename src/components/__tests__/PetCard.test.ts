import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it } from 'vitest'
import PetCard from '../PetCard.vue'
import { i18n } from '../../i18n'
import { setSessionToken } from '../../services/authSession'
import { useSavedPets } from '../../composables/useSavedPets'
import type { Pet } from '../../types/pet'
const pet: Pet = { id: 'feed-maple', name: 'Maple', species: 'Dog', breed: 'Collie', district: 'Sha Tin', photo: 'https://example.test/maple.webp', owner: 'Fictional owner', description: '', canViewContact: false, status: 'lost', location: 'PRIVATE_LOCATION_MUST_NOT_BE_A_FEED_LABEL', locationPrecision: 'approximate', distanceKm: 1.5, lastSeen: '1h', postedAgo: '2h', mapX: 50, mapY: 50, reward: '$100' }
function render(feed = true, values: Partial<Pet> = {}) { return mount(PetCard, { props: { pet: { ...pet, ...values }, feed }, global: { stubs: { ManagedImage: { props: ['src'], emits: ['error'], template: '<img :src="src" @error="$emit(\'error\', $event)" />' } } } }) }
beforeEach(() => { localStorage.clear(); setSessionToken(null); i18n.global.locale.value = 'en' })

it.each(['en', 'zh-HK', 'zh-CN'] as const)('%s keeps original card actions, safe metadata and a keyboard entry point', async locale => {
  i18n.global.locale.value = locale
  const wrapper = render()
  expect(wrapper.get('article').attributes('role')).toBe('link')
  expect(wrapper.get('article').attributes('tabindex')).toBe('0')
  expect(wrapper.findAll('h3')).toHaveLength(1)
  expect(wrapper.get('.feed-card-header h3').text()).toBe('Maple')
  expect(wrapper.get('.feed-card-header .feed-status').text()).toBe(i18n.global.t('pets.lost'))
  expect(wrapper.get('.feed-location').text()).toContain(i18n.global.t('feedDesign.approxDistance', { distance: i18n.global.t('common.kilometres', { count: 1.5 }) }))
  expect(wrapper.text()).not.toContain('PRIVATE_LOCATION')
  expect(wrapper.get('.feed-photo').find('button').exists()).toBe(false)
  await wrapper.get('.feed-card-header').trigger('click')
  await wrapper.get('article').trigger('keydown', { key: 'Enter' })
  expect(wrapper.emitted('open')).toHaveLength(2)
  await wrapper.get('.found-btn').trigger('keydown', { key: 'Enter' }); await wrapper.get('.found-btn').trigger('click')
  expect(wrapper.emitted('found')).toHaveLength(1)
  expect(wrapper.emitted('open')).toHaveLength(2)
  await wrapper.get('.feed-save').trigger('keydown', { key: 'Enter' }); await wrapper.get('.feed-save').trigger('click')
  expect(useSavedPets().isSaved(pet.id)).toBe(true)
  expect(wrapper.get('.feed-save').attributes('aria-pressed')).toBe('true')
  expect(wrapper.emitted('open')).toHaveLength(2)
  await wrapper.get('.feed-save').trigger('click')
  expect(useSavedPets().isSaved(pet.id)).toBe(false)
  expect(wrapper.get('.feed-save').attributes('aria-pressed')).toBe('false')
  expect(wrapper.text()).not.toContain('feedDesign.')
  wrapper.unmount()
})

it('keeps saved/default cards on their existing layout unless feed is explicitly enabled', () => {
  const wrapper = render(false)
  expect(wrapper.find('.feed-card-header').exists()).toBe(false)
  expect(wrapper.find('.body .row').exists()).toBe(true)
  expect(wrapper.find('.save-button').exists()).toBe(true)
  expect(wrapper.attributes('tabindex')).toBeUndefined()
  wrapper.unmount()
})

it('retains the image component and fallback/retry behavior without inventing missing distances', async () => {
  const wrapper = render(true, { photo: '', photos: ['https://example.test/alternate.webp'], distanceKm: undefined })
  expect(wrapper.get('img').attributes('src')).toBe('https://example.test/alternate.webp')
  expect(wrapper.get('img').attributes('alt')).toContain('Maple')
  expect(wrapper.get('.feed-location').text()).not.toContain('km')
  await wrapper.get('img').trigger('error')
  expect(wrapper.find('.photo-placeholder').exists()).toBe(true)
  await wrapper.setProps({ pet: { ...pet, photo: 'https://example.test/replacement.webp' } }); await flushPromises()
  expect(wrapper.get('img').attributes('src')).toBe('https://example.test/replacement.webp')
  wrapper.unmount()
})
