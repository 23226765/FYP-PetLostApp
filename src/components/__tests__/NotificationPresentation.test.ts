import { mount } from '@vue/test-utils'
import { afterEach, expect, it } from 'vitest'
import { nextTick } from 'vue'
import Panel from '../NotificationsPanel.vue'
import { i18n, translateApiError } from '../../i18n'
import { notificationPresentation } from '../../i18n/notifications'
import type { AppNotification } from '../../types/notification'
const notice: AppNotification = { id: 'notice', type: 'message', title: 'Legacy English system title', body: 'Legacy English system body', time: '1m ago', read: false, petId: 'pet', strayId: 'shared-stray', createdAt: '2026-10-19T12:00:00', conversation: { petId: 'pet', participantId: 'finder', messageId: 'message' } }
afterEach(() => { i18n.global.locale.value = 'en' })
it('message notification opens its conversation, never the shared stray or generic pet detail', async () => {
  const wrapper = mount(Panel, { props: { notifications: [notice] }, global: { stubs: { AppIcon: true, ManagedImage: true } } })
  await wrapper.get('.notif-row').trigger('click')
  expect(wrapper.emitted('open-chat')?.[0]).toEqual([notice])
  expect(wrapper.emitted('open-pet')).toBeUndefined()
  expect(wrapper.emitted('open-stray')).toBeUndefined()
  wrapper.unmount()
})
it.each(['en', 'zh-HK', 'zh-CN'] as const)('localizes modern and legacy notifications reactively in %s and preserves names/authored text', async locale => {
  const sighting: AppNotification = { ...notice, type: 'sighting', event: { code: 'sighting', params: { petName: 'Maple', district: 'Sha Tin' } } }
  const text: AppNotification = { ...notice, event: { code: 'message.text', params: { text: 'Please call me later — 原文' } } }
  const wrapper = mount(Panel, { props: { notifications: [sighting, { ...text, id: 'second' }, { ...notice, id: 'legacy' }] }, global: { stubs: { AppIcon: true, ManagedImage: true } } })
  i18n.global.locale.value = locale; await nextTick()
  expect(wrapper.text()).toContain(notificationPresentation(sighting).title)
  expect(wrapper.text()).toContain('Maple')
  expect(wrapper.text()).toContain('Please call me later — 原文')
  expect(wrapper.text()).not.toContain('Legacy English system')
  expect(wrapper.text()).not.toContain('1m ago')
  expect(wrapper.text()).toContain(i18n.global.t('notificationEvents.messageBody'))
  expect(notificationPresentation({ ...notice, event: { code: 'message.photo', params: {} } }).body).toBe(i18n.global.t('notificationEvents.photoBody'))
  expect(notificationPresentation({ ...notice, event: { code: 'message.sharedPost', params: {} } }).body).toBe(i18n.global.t('notificationEvents.sharedBody'))
  wrapper.unmount()
})
it.each(['en', 'zh-HK', 'zh-CN'] as const)('preserves useful bounded validation detail without raw English or submitted values in %s', locale => {
  i18n.global.locale.value = locale
  const error = Object.assign(new Error('Private submitted value'), { apiCode: 'FIELD_TOO_LONG', field: 'realName', params: { max: 100, submitted: 'secret' } })
  const translated = translateApiError(error)
  expect(translated).toContain('100')
  expect(translated).toContain(i18n.global.t('settings.realName'))
  expect(translated).not.toContain('secret')
  expect(translated).not.toContain('Private submitted')
  expect(translateApiError(Object.assign(new Error('English message'), { apiCode: 'CHAT_MESSAGE_TOO_LONG', params: { max: 2000 } }))).toContain('2000')
})
