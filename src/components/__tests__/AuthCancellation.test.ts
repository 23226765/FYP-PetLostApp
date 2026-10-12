import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuthScreen from '../AuthScreen.vue'
import { i18n } from '../../i18n'
import { invalidateAuthContext } from '../../services/authSession'

const api = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn() }))
vi.mock('../../services/api', () => api)

describe('cancelled and obsolete authentication cannot persist credentials', () => {
  beforeEach(() => { localStorage.clear(); invalidateAuthContext(); vi.clearAllMocks(); i18n.global.locale.value = 'en' })
  it.each(['close', 'guest', 'unmount', 'switch-mode', 'account-switch'])('%s prevents late login success', async (action) => {
    let finish!: (value: unknown) => void
    api.login.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const wrapper = mount(AuthScreen, { global: { plugins: [i18n], stubs: { AppIcon: true } } })
    await wrapper.get('input[type="email"]').setValue('fictional@example.test')
    await wrapper.get('input[type="password"]').setValue('fictional-password')
    await wrapper.get('form').trigger('submit')
    if (action === 'close') await wrapper.get('.close-btn').trigger('click')
    if (action === 'guest') await wrapper.get('.guest-link').trigger('click')
    if (action === 'unmount') wrapper.unmount()
    if (action === 'switch-mode') await wrapper.get('.tabs button:nth-child(2)').trigger('click')
    if (action === 'account-switch') { localStorage.setItem('token', 'different-account'); invalidateAuthContext() }
    finish({ token: 'obsolete-fixture-token', user: { id: 'old-id', name: 'Old account' } })
    await flushPromises()
    expect(wrapper.emitted('authenticated')).toBeUndefined()
    expect(localStorage.getItem('token')).toBe(action === 'account-switch' ? 'different-account' : null)
    if (action !== 'unmount') wrapper.unmount()
  })
})
