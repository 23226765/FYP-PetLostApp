import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import Inbox from '../ChatInboxScreen.vue'
import Chat from '../Chatscreen.vue'
import { setSessionToken } from '../../services/authSession'
import { i18n } from '../../i18n'
import { chatDayLabel, formatClockTime } from '../../i18n/formatters'
import AppIcon from '../AppIcon.vue'

const api = vi.hoisted(() => ({ getChatInbox: vi.fn(), getMessages: vi.fn(), markChatMessagesRead: vi.fn(), sendMessage: vi.fn(), discardManagedImage: vi.fn(), uploadManagedImage: vi.fn() }))
vi.mock('../../services/api', () => api)
enableAutoUnmount(afterEach)
const owner = { id: 'owner', name: 'Owner', email: 'owner@example.test' }
const finder = { id: 'finder', name: 'Finder', email: 'finder@example.test' }
const pet = { id: 'pet', name: 'Maple', photo: '', owner: 'Owner', reportedBy: 'owner', participantId: 'finder', canViewContact: false }
const message = (id = 'incoming', sender: 'owner' | 'finder' = 'finder', createdAt = '2026-10-19T12:00:00') => ({ id, sender, petId: 'pet', text: `User-written ${id}`, createdAt })
const conversation = (unreadCount = 1) => ({ id: 'pet:finder', pet, lastMessage: message('outgoing', 'owner'), updatedAt: '2026-10-19T12:00:00', unreadCount })
const stubs = { AppIcon: true, ManagedImage: true, SafetyActions: true, ContentImageEditor: true, ImageUploadStatus: true }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-19T13:00:00'))
  Object.values(api).forEach(mock => mock.mockReset())
  api.getChatInbox.mockResolvedValue([conversation()])
  api.getMessages.mockResolvedValue({ viewerRole: 'owner', messages: [message(), message('own', 'owner')] })
  api.markChatMessagesRead.mockResolvedValue(undefined)
  api.discardManagedImage.mockResolvedValue(undefined)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  setSessionToken('fictional-message-state')
  i18n.global.locale.value = 'en'
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); i18n.global.locale.value = 'en' })
async function chat() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  await router.push('/'); await router.isReady()
  const wrapper = mount(Chat, { props: { user: owner, pet }, global: { plugins: [router], stubs } })
  await flushPromises()
  return wrapper
}
it('uses server incoming unread counts even if the latest message is outgoing, not local timestamps', async () => {
  localStorage.setItem('pawradar:chat-read:owner:pet:finder', String(Date.now() + 10000))
  const wrapper = mount(Inbox, { props: { user: owner }, global: { stubs } })
  await flushPromises()
  expect(wrapper.find('.unread-badge').exists()).toBe(true)
  await wrapper.get('.conversation-card').trigger('click')
  expect(wrapper.find('.unread-badge').exists()).toBe(true)
  expect(api.markChatMessagesRead).not.toHaveBeenCalled()
  api.getChatInbox.mockResolvedValue([conversation(0)])
  window.dispatchEvent(new Event('chat:read')); await flushPromises()
  expect(wrapper.find('.unread-badge').exists()).toBe(false)
  expect(wrapper.emitted('unread-change')?.at(-1)).toEqual([0])
})
it('outgoing-only conversations never display an unread badge', async () => {
  api.getChatInbox.mockResolvedValue([conversation(0)])
  const wrapper = mount(Inbox, { props: { user: owner }, global: { stubs } })
  await flushPromises()
  expect(wrapper.find('.unread-badge').exists()).toBe(false)
})
it('acknowledges displayed incoming IDs only and does not repeat successful acknowledgments on polling', async () => {
  await chat()
  expect(api.markChatMessagesRead).toHaveBeenCalledExactlyOnceWith('pet', 'finder', ['incoming'])
  await vi.advanceTimersByTimeAsync(5000); await flushPromises()
  expect(api.markChatMessagesRead).toHaveBeenCalledTimes(1)
})
it('does not acknowledge a background/unfocused conversation until it becomes active', async () => {
  vi.mocked(document.hasFocus).mockReturnValue(false)
  await chat()
  expect(api.markChatMessagesRead).not.toHaveBeenCalled()
  vi.mocked(document.hasFocus).mockReturnValue(true)
  window.dispatchEvent(new Event('focus')); await flushPromises()
  expect(api.markChatMessagesRead).toHaveBeenCalledTimes(1)
})
it('read failure retains messages and offers retry without falsely clearing server unread', async () => {
  api.markChatMessagesRead.mockRejectedValueOnce(new Error('Network unavailable'))
  const wrapper = await chat()
  expect(wrapper.text()).toContain('User-written incoming')
  expect(wrapper.get('[role="alert"]').text()).toContain('read status could not be saved')
  await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
  expect(api.markChatMessagesRead).toHaveBeenCalledTimes(2)
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
})
it.each(['account-switch', 'unmount', 'conversation-change'])('ignores stale transcript/read completions after %s', async action => {
  let finish!: (value: unknown) => void
  api.getMessages.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const wrapper = await chat()
  if (action === 'account-switch') setSessionToken('fictional-new-account')
  else if (action === 'unmount') wrapper.unmount()
  else {
    api.getMessages.mockResolvedValue({ viewerRole: 'owner', messages: [] })
    await wrapper.setProps({ pet: { ...pet, id: 'another-pet' } }); await flushPromises()
  }
  const calls = api.markChatMessagesRead.mock.calls.length
  finish({ viewerRole: 'owner', messages: [message('stale-private')] }); await flushPromises()
  expect(api.markChatMessagesRead).toHaveBeenCalledTimes(calls)
  if (action !== 'unmount') expect(wrapper.text()).not.toContain('stale-private')
})
it('blocked or hidden targets clear cached transcript and disable sending after a refresh', async () => {
  const wrapper = await chat()
  api.getMessages.mockRejectedValue(Object.assign(new Error('Blocked'), { status: 403 }))
  await vi.advanceTimersByTimeAsync(5000); await flushPromises()
  expect(wrapper.find('.bubble-row').exists()).toBe(false)
  expect(wrapper.get('.send-btn').attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain('conversation is unavailable')
})
it('account switching invalidates an in-flight inbox and starts the new account fetch immediately', async () => {
  let finish!: (value: unknown) => void
  api.getChatInbox.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const wrapper = mount(Inbox, { props: { user: owner }, global: { stubs } })
  await flushPromises()
  setSessionToken('fictional-finder-account')
  api.getChatInbox.mockResolvedValue([])
  await wrapper.setProps({ user: finder }); await flushPromises()
  finish([conversation(5)]); await flushPromises()
  expect(wrapper.find('.conversation-card').exists()).toBe(false)
  expect(wrapper.emitted('unread-change')?.at(-1)).toEqual([0])
})
it.each(['read', 'send'])('a %s authorization failure immediately clears privileged transcript state', async operation => {
  const wrapper = await chat()
  if (operation === 'read') {
    api.getMessages.mockResolvedValue({ viewerRole: 'owner', messages: [message('new-incoming')] })
    api.markChatMessagesRead.mockRejectedValue(Object.assign(new Error('Hidden'), { status: 404 }))
    await vi.advanceTimersByTimeAsync(5000); await flushPromises()
  } else {
    api.sendMessage.mockRejectedValue(Object.assign(new Error('Blocked'), { status: 403 }))
    await wrapper.get('.chat-input').setValue('Unsent input')
    await wrapper.get('.send-btn').trigger('click'); await flushPromises()
    expect((wrapper.get('.chat-input').element as HTMLInputElement).value).toBe('Unsent input')
  }
  expect(wrapper.find('.bubble-row').exists()).toBe(false)
  expect(wrapper.get('.send-btn').attributes('disabled')).toBeDefined()
})
it('a poll begun before sending cannot erase the confirmed outgoing message', async () => {
  const wrapper = await chat()
  let finish!: (value: unknown) => void
  api.getMessages.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  await vi.advanceTimersByTimeAsync(5000)
  api.sendMessage.mockResolvedValue(message('confirmed-send', 'owner'))
  await wrapper.get('.chat-input').setValue('New message')
  await wrapper.get('.send-btn').trigger('click'); await flushPromises()
  finish({ viewerRole: 'owner', messages: [message()] }); await flushPromises()
  expect(wrapper.text()).toContain('User-written confirmed-send')
})
it('switching A to B to A clears attachments and cannot revive an old send completion', async () => {
  const wrapper = await chat()
  let finish!: (value: unknown) => void
  api.sendMessage.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  await wrapper.get('.chat-input').setValue('Old draft')
  await wrapper.get('.send-btn').trigger('click')
  api.getMessages.mockResolvedValue({ viewerRole: 'owner', messages: [] })
  await wrapper.setProps({ pet: { ...pet, id: 'other' } }); await flushPromises()
  await wrapper.setProps({ pet }); await flushPromises()
  finish(message('stale-sent', 'owner')); await flushPromises()
  expect(wrapper.text()).not.toContain('stale-sent')
  expect((wrapper.get('.chat-input').element as HTMLInputElement).value).toBe('')
})
it.each(['en', 'zh-HK', 'zh-CN'] as const)('groups historical dates and uses app-localized time in %s without changing authored text', async locale => {
  api.getMessages.mockResolvedValue({ viewerRole: 'owner', messages: [message('older', 'finder', '2026-09-01T12:00:00'), message('yesterday', 'finder', '2026-10-18T12:00:00'), message('today', 'owner')] })
  const wrapper = await chat()
  i18n.global.locale.value = locale; await flushPromises()
  expect(wrapper.findAll('.day-divider').map(row => row.text())).toEqual(['2026-09-01T12:00:00', '2026-10-18T12:00:00', '2026-10-19T12:00:00'].map(chatDayLabel))
  expect(wrapper.findAll('.time').at(-1)?.text()).toBe(formatClockTime('2026-10-19T12:00:00'))
  expect(wrapper.text()).toContain('User-written older')
  expect(wrapper.text()).toContain('User-written today')
})
it('renders the send icon and disables empty sends, with a busy state during a single send', async () => {
  expect(mount(AppIcon, { props: { name: 'send' } }).findAll('path')).toHaveLength(2)
  const wrapper = await chat()
  expect(wrapper.get('.send-btn').attributes('disabled')).toBeDefined()
  await wrapper.get('.chat-input').setValue('A text-only reply')
  let finish!: (value: unknown) => void
  api.sendMessage.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  await wrapper.get('.send-btn').trigger('click')
  expect(wrapper.get('.send-btn').attributes('aria-busy')).toBe('true')
  expect(wrapper.find('.send-spinner').exists()).toBe(true)
  await wrapper.get('.send-btn').trigger('click')
  expect(api.sendMessage).toHaveBeenCalledTimes(1)
  finish(message('sent-text', 'owner')); await flushPromises()
  expect(wrapper.find('content-image-editor-stub').exists()).toBe(false)
  expect(wrapper.find('.bubble-photo').exists()).toBe(false)
})
it('offers image editing only for genuine outgoing attachments through polls, removal and reload', async () => {
  api.getMessages.mockResolvedValue({ viewerRole: 'owner', messages: [message('text', 'owner'), { ...message('legacy-empty', 'owner'), photo: '  ' }, { ...message('incoming-photo'), photo: '/api/uploads/managed/incoming/content' }] })
  const wrapper = await chat()
  expect(wrapper.find('content-image-editor-stub').exists()).toBe(false)
  expect(wrapper.findAll('.bubble-photo')).toHaveLength(1)
  api.getMessages.mockResolvedValue({ viewerRole: 'owner', messages: [message('text', 'owner'), { ...message('photo', 'owner'), photo: '/api/uploads/managed/owned/content' }] })
  await vi.advanceTimersByTimeAsync(5000); await flushPromises()
  const editor = wrapper.getComponent({ name: 'ContentImageEditor' })
  expect(editor.props('id')).toBe('photo')
  editor.vm.$emit('updated', []); await flushPromises()
  expect(wrapper.find('content-image-editor-stub').exists()).toBe(false)
  expect(wrapper.find('.bubble-photo').exists()).toBe(false)
  api.getMessages.mockResolvedValue({ viewerRole: 'owner', messages: [message('text', 'owner'), { ...message('photo', 'owner'), photo: '' }] })
  await vi.advanceTimersByTimeAsync(5000); await flushPromises()
  expect(wrapper.find('content-image-editor-stub').exists()).toBe(false)
})
it.each(['en', 'zh-HK', 'zh-CN'] as const)('searches authorized participant names without changing unread totals in %s', async locale => {
  i18n.global.locale.value = locale
  api.getChatInbox.mockResolvedValue([
    { ...conversation(2), id: 'maya', pet: { ...pet, participantName: 'Maya Demo' } },
    { ...conversation(1), id: 'jason', pet: { ...pet, participantName: 'Jason' } },
  ])
  const wrapper = mount(Inbox, { props: { user: owner }, global: { stubs } }); await flushPromises()
  await wrapper.get('input[type="search"]').setValue('ＭＡＹＡ')
  expect(wrapper.findAll('.conversation-card')).toHaveLength(1)
  expect(wrapper.text()).toContain('Maya Demo')
  expect(wrapper.emitted('unread-change')?.at(-1)).toEqual([3])
  await wrapper.get('input[type="search"]').setValue('Maple')
  expect(wrapper.text()).toContain(i18n.global.t('messagingUpdates.noResults'))
  expect(api.getChatInbox).toHaveBeenCalledTimes(1)
  await wrapper.get('.conversation-search button').trigger('click')
  expect(wrapper.findAll('.conversation-card')).toHaveLength(2)
})
it('retains search during polling, searches the public owner display name, and clears it across accounts', async () => {
  api.getChatInbox.mockResolvedValue([{ ...conversation(0), pet: { ...pet, owner: 'Report contact', ownerDisplayName: 'Ava Public' } }])
  const wrapper = mount(Inbox, { props: { user: finder }, global: { stubs } }); await flushPromises()
  await wrapper.get('input[type="search"]').setValue('ava')
  expect(wrapper.text()).toContain('Ava Public')
  await vi.advanceTimersByTimeAsync(30000); await flushPromises()
  expect((wrapper.get('input[type="search"]').element as HTMLInputElement).value).toBe('ava')
  setSessionToken('next-account'); await flushPromises()
  expect(wrapper.find('input[type="search"]').exists()).toBe(false)
  await wrapper.setProps({ user: owner }); await flushPromises()
  expect((wrapper.get('input[type="search"]').element as HTMLInputElement).value).toBe('')
})
