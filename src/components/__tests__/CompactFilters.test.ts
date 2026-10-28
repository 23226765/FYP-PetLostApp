import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import Radar from '../RadarScreen.vue'
import FilterSheet from '../FilterSheet.vue'
import { i18n } from '../../i18n'
vi.mock('../../services/api', () => ({ getHotspots: vi.fn() }))
beforeEach(() => {
  i18n.global.locale.value = 'en'
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
it.each(['en', 'zh-HK', 'zh-CN'] as const)('%s exposes only animal/district filters and exactly five radius presets', async locale => {
  i18n.global.locale.value = locale
  const wrapper = mount(Radar, { props: { pets: [], radiusKm: 19, species: 'All', breed: '', district: '', unreadCount: 0, userLocation: null }, global: { stubs: { AppIcon: true, PetCard: true, MapView: true } } })
  expect(wrapper.find('.chips').exists()).toBe(false)
  expect(wrapper.find('input[type="search"]').exists()).toBe(false)
  expect(wrapper.find('input[type="range"]').exists()).toBe(false)
  const selects = wrapper.findAll('.detail-filters select')
  expect(selects[0].findAll('option').map(option => option.element.value)).toEqual(['All', 'Dogs', 'Cats', 'Other'])
  await selects[0].setValue('Cats'); await selects[1].setValue('Sha Tin')
  expect(wrapper.emitted('species-change')?.at(-1)).toEqual(['Cats'])
  expect(wrapper.emitted('district-change')?.at(-1)).toEqual(['Sha Tin'])
  expect(wrapper.get('.radius-trigger').text()).toContain('19')
  expect(wrapper.get('.detail-filters .radius-trigger').exists()).toBe(true)
  await wrapper.get('.radius-trigger').trigger('click'); await flushPromises()
  expect(wrapper.get('dialog').attributes()).toHaveProperty('open')
  expect(wrapper.findAll('input[type="radio"]').map(input => input.element.getAttribute('value'))).toEqual(['1', '5', '10', '15', '20'])
  expect(wrapper.emitted('radius-change')).toBeUndefined()
  await wrapper.get('input[value="10"]').setValue()
  expect(wrapper.emitted('radius-change')).toEqual([[10]])
  expect(wrapper.get('dialog').attributes()).not.toHaveProperty('open')
  wrapper.unmount()
})
it('uses a labelled native modal and closes on Escape/backdrop without closing on content clicks', async () => {
  const wrapper = mount(FilterSheet, { props: { open: true, title: 'Filters' }, slots: { default: '<button class="inside">Inside</button>' }, global: { stubs: { AppIcon: true } } })
  await flushPromises()
  const dialog = wrapper.get('dialog')
  expect(dialog.attributes('aria-labelledby')).toBe(wrapper.get('h2').attributes('id'))
  expect(dialog.attributes()).toHaveProperty('open')
  await wrapper.get('.inside').trigger('click'); expect(wrapper.emitted('close')).toBeUndefined()
  await dialog.trigger('cancel'); expect(wrapper.emitted('close')).toHaveLength(1)
  await dialog.trigger('click'); expect(wrapper.emitted('close')).toHaveLength(2)
  await wrapper.setProps({ open: false }); expect(dialog.attributes()).not.toHaveProperty('open')
  wrapper.unmount()
})
