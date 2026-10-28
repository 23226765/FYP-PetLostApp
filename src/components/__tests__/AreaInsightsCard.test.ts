import { mount } from '@vue/test-utils'
import { beforeEach, expect, it } from 'vitest'
import AreaInsightsCard from '../AreaInsightsCard.vue'
import { i18n } from '../../i18n'
import { districtLabel } from '../../i18n/formatters'
import type { AreaInsights } from '../../types/pet'

const summary = (extra: Partial<AreaInsights> = {}): AreaInsights => ({ total: 1200, speciesCounts: { dog: 800, cat: 300, other: 100 }, unclassifiedSpeciesCount: 0, topDistricts: ['Sha Tin'], topDistrictCount: 700, unknownDistrictCount: 0, unknownIsTop: false, recentCount: 40, unknownDateCount: 0, futureDateCount: 0, windowStart: '2026-10-21T12:00:00Z', windowEnd: '2026-10-28T12:00:00Z', ...extra })
beforeEach(() => { i18n.global.locale.value = 'en' })

it.each(['en', 'zh-HK', 'zh-CN'] as const)('%s renders localized counts and recorded-report definitions without risk predictions', locale => {
  i18n.global.locale.value = locale
  const wrapper = mount(AreaInsightsCard, { props: { insights: summary(), loading: false } })
  expect(wrapper.text()).toContain(districtLabel('Sha Tin'))
  expect(wrapper.text()).toContain(i18n.global.t('areaInsights.recent'))
  expect(wrapper.text()).toContain(i18n.global.t('areaInsights.disclaimer'))
  expect(wrapper.text()).toContain(i18n.global.t('areaInsights.reportCount', { count: '40' }, 40))
  expect(wrapper.get('section').attributes('aria-labelledby')).toBe(wrapper.get('h2').attributes('id'))
  expect(wrapper.text()).not.toContain('areaInsights.')
  wrapper.unmount()
})

it('exposes every tied district through native disclosure, including a tied unknown group', () => {
  const wrapper = mount(AreaInsightsCard, { props: { insights: summary({ topDistricts: ['Sha Tin', 'Tai Po'], unknownIsTop: true, unknownDistrictCount: 700 }), loading: false } })
  expect(wrapper.find('details summary').exists()).toBe(true)
  expect(wrapper.findAll('details li').map(item => item.text())).toEqual(['Sha Tin', 'Tai Po', 'Unknown district'])
  expect(wrapper.get('summary').text()).toContain('3 groups tied')
  wrapper.unmount()
})

it('uses singular report wording for tied leaders and a sparse single-report sample', async () => {
  const wrapper = mount(AreaInsightsCard, { props: { insights: summary({ total: 2, topDistricts: ['Sha Tin', 'Tai Po'], topDistrictCount: 1 }), loading: false } })
  expect(wrapper.get('summary').text()).toBe('2 groups tied · 1 report each')
  await wrapper.setProps({ insights: summary({ total: 1, topDistrictCount: 1 }) })
  expect(wrapper.get('.quality').text()).toBe('Only 1 report recorded: a limited sample.')
  expect(wrapper.get('.district-stat dd').text()).toBe('Sha Tin · 1 report')
  wrapper.unmount()
})

it('does not invent a district winner when unknown values dominate; exposes sparse and date-quality limits', () => {
  const wrapper = mount(AreaInsightsCard, { props: { insights: summary({ total: 3, topDistricts: [], topDistrictCount: 3, unknownDistrictCount: 3, unknownIsTop: true, unknownDateCount: 2, futureDateCount: 1, unclassifiedSpeciesCount: 1 }), loading: false } })
  expect(wrapper.text()).toContain('no reliable district leader')
  expect(wrapper.text()).toContain('limited sample')
  expect(wrapper.text()).toContain('2 reports without usable dates and 1 with future dates')
  expect(wrapper.text()).toContain('Unclassified 1')
  expect(wrapper.text()).not.toContain('Sha Tin')
  wrapper.unmount()
})

it('keeps loading, failure, missing metrics and successful empty results distinct', async () => {
  const wrapper = mount(AreaInsightsCard, { props: { insights: null, loading: true } })
  expect(wrapper.get('[role="status"]').text()).toBe(i18n.global.t('areaInsights.loading'))
  expect(wrapper.find('dl').exists()).toBe(false)
  await wrapper.setProps({ loading: false, failed: true, insights: summary() })
  expect(wrapper.text()).toContain(i18n.global.t('areaInsights.unavailable'))
  expect(wrapper.find('dl').exists()).toBe(false)
  await wrapper.setProps({ failed: false, insights: null })
  expect(wrapper.text()).toContain(i18n.global.t('areaInsights.unavailable'))
  await wrapper.setProps({ insights: summary({ total: 0, speciesCounts: { dog: 0, cat: 0, other: 0 }, recentCount: 0, topDistricts: [], topDistrictCount: 0 }) })
  expect(wrapper.text()).toContain(i18n.global.t('areaInsights.empty'))
  expect(wrapper.text()).not.toContain(i18n.global.t('areaInsights.unavailable'))
  wrapper.unmount()
})

it('reacts to language changes without rewriting report data', async () => {
  const data = summary()
  const wrapper = mount(AreaInsightsCard, { props: { insights: data, loading: false } })
  i18n.global.locale.value = 'zh-HK'; await wrapper.vm.$nextTick()
  expect(wrapper.get('h2').text()).toBe(i18n.global.t('areaInsights.title'))
  expect(data.topDistricts).toEqual(['Sha Tin'])
  wrapper.unmount()
})
