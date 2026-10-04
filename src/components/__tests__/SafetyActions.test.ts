import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SafetyActions from '../SafetyActions.vue'
import { i18n } from '../../i18n'

const apiMocks = vi.hoisted(() => ({ reportContent: vi.fn(), blockUser: vi.fn() }))
vi.mock('../../services/api', () => apiMocks)

const user = { id: 'viewer-id', name: 'Viewer', email: 'viewer@example.test' }

describe('SafetyActions', () => {
  beforeEach(() => {
    apiMocks.reportContent.mockReset()
    apiMocks.blockUser.mockReset()
    i18n.global.locale.value = 'en'
  })
  afterEach(() => { document.body.innerHTML = '' })

  it('requires authentication without opening or submitting a report', async () => {
    const wrapper = mount(SafetyActions, { props: { targetType: 'pet', targetId: 'pet-id', user: null } })
    await wrapper.get('.safety-link').trigger('click')
    expect(wrapper.emitted('auth-needed')).toHaveLength(1)
    expect(apiMocks.reportContent).not.toHaveBeenCalled()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('submits one explicit report and renders idempotent success feedback', async () => {
    apiMocks.reportContent.mockResolvedValue({ id: 'report-id', targetType: 'pet', targetId: 'pet-id', reason: 'scam', status: 'pending', createdAt: new Date().toISOString(), duplicate: false })
    const wrapper = mount(SafetyActions, { props: { targetType: 'pet', targetId: 'pet-id', user } })
    await wrapper.get('.safety-link').trigger('click')
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    ;(dialog.querySelector('select') as HTMLSelectElement).value = 'scam'
    dialog.querySelector('select')?.dispatchEvent(new Event('change', { bubbles: true }))
    ;(dialog.querySelector('textarea') as HTMLTextAreaElement).value = 'Suspicious request'
    dialog.querySelector('textarea')?.dispatchEvent(new Event('input', { bubbles: true }))
    dialog.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()

    expect(apiMocks.reportContent).toHaveBeenCalledTimes(1)
    expect(apiMocks.reportContent).toHaveBeenCalledWith({ targetType: 'pet', targetId: 'pet-id', reason: 'scam', details: 'Suspicious request' })
    expect(dialog.textContent).toContain('Report submitted')
  })

  it('blocks only after confirmation and emits the blocked user id', async () => {
    apiMocks.blockUser.mockResolvedValue({ id: 'owner-id', name: 'Owner', avatar: '', blockedAt: new Date().toISOString() })
    const wrapper = mount(SafetyActions, { props: { targetType: 'pet', targetId: 'pet-id', subjectUserId: 'owner-id', subjectLabel: 'Owner', user } })
    await wrapper.findAll('.safety-link')[1].trigger('click')
    expect(apiMocks.blockUser).not.toHaveBeenCalled()
    const confirm = [...document.body.querySelectorAll('button')].find((button) => button.textContent?.includes('Block account')) as HTMLButtonElement
    confirm.click()
    await flushPromises()
    expect(apiMocks.blockUser).toHaveBeenCalledWith('owner-id')
    expect(wrapper.emitted('blocked')?.[0]).toEqual(['owner-id'])
  })

  it('clears an open action when the session logs out or switches account', async () => {
    const wrapper = mount(SafetyActions, { props: { targetType: 'pet', targetId: 'pet-id', user } })
    await wrapper.get('.safety-link').trigger('click')
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
    await wrapper.setProps({ user: null })
    await flushPromises()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(apiMocks.reportContent).not.toHaveBeenCalled()
  })

  it.each(['en', 'zh-HK', 'zh-CN'] as const)('renders complete safety labels in %s under dark mode', async (locale) => {
    i18n.global.locale.value = locale
    document.documentElement.dataset.theme = 'dark'
    const wrapper = mount(SafetyActions, { props: { targetType: 'pet', targetId: 'pet-id', user } })
    await wrapper.get('.safety-link').trigger('click')
    const dialogText = document.body.querySelector('[role="dialog"]')?.textContent || ''
    expect(dialogText).not.toContain('safety.')
    expect(dialogText.trim().length).toBeGreaterThan(20)
    wrapper.unmount()
  })
})
