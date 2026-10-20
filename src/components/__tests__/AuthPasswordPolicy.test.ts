import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuthScreen from '../AuthScreen.vue'
import { i18n, translateApiError } from '../../i18n'
import { invalidateAuthContext } from '../../services/authSession'

const api = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn() }))
vi.mock('../../services/api', () => api)
const createWrapper = () => mount(AuthScreen, { global: { plugins: [i18n], stubs: { AppIcon: true } } })
const success = { token: 'isolated-fixture-token', user: { id: 'fixture', name: 'Fixture' } }

describe('registration-only password limit', () => {
  beforeEach(() => { localStorage.clear(); invalidateAuthContext(); vi.resetAllMocks(); i18n.global.locale.value = 'en' })

  it.each(['en', 'zh-HK', 'zh-CN'] as const)('%s presents guidance and localized byte errors without losing form input', async (locale) => {
    i18n.global.locale.value = locale
    const wrapper = createWrapper()
    await wrapper.get('.tabs button:nth-child(2)').trigger('click')
    await wrapper.get('input[type="email"]').setValue('fixture@example.test')
    await wrapper.get('input[type="password"]').setValue('虎'.repeat(24) + 'a')
    expect(wrapper.get('#password-guidance').text()).toContain('72')
    expect(wrapper.get('input[type="password"]').attributes('aria-describedby')).toBe('password-guidance')
    expect(wrapper.get('input[type="password"]').attributes('maxlength')).toBeUndefined()
    await wrapper.get('form').trigger('submit')
    expect(api.register).not.toHaveBeenCalled()
    const error = Object.assign(new Error('Backend fallback'), { apiCode: 'PASSWORD_TOO_LONG', field: 'password', params: { maxBytes: 72 } })
    expect(wrapper.get('[role="alert"]').text()).toContain(translateApiError(error))
    expect(translateApiError(Object.assign(new Error(), { apiCode: 'PASSWORD_TOO_LONG' }))).toBe(translateApiError(error))
    expect((wrapper.get('input[type="password"]').element as HTMLInputElement).value).toBe('虎'.repeat(24) + 'a')
    expect((wrapper.get('input[type="email"]').element as HTMLInputElement).value).toBe('fixture@example.test')
    // Login mode has no new maximum, including after a rejected registration.
    await wrapper.get('.tabs button:first-child').trigger('click')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('#password-guidance').exists()).toBe(false)
    api.login.mockResolvedValue(success)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.login).toHaveBeenCalledWith({ email: 'fixture@example.test', password: '虎'.repeat(24) + 'a' })
    expect(wrapper.emitted('authenticated')).toHaveLength(1)
    wrapper.unmount()
  })

  it.each([
    ['ASCII below', 'a'.repeat(71)], ['ASCII at', 'a'.repeat(72)],
    ['CJK below', '虎'.repeat(23) + 'ab'], ['CJK at', '虎'.repeat(24)],
    ['emoji below', '🐾'.repeat(17) + 'abc'], ['emoji at', '🐾'.repeat(18)],
    ['unchanged whitespace and decomposed Unicode', '  e\u0301-unchanged  '],
  ])('sends accepted %s unchanged', async (_label, password) => {
    api.register.mockResolvedValue(success)
    const wrapper = createWrapper()
    await wrapper.get('.tabs button:nth-child(2)').trigger('click')
    await wrapper.get('input[type="password"]').setValue(password)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.register.mock.calls[0]?.[0].password).toBe(password)
    expect(wrapper.emitted('authenticated')).toHaveLength(1)
    wrapper.unmount()
  })

  it.each(['a'.repeat(73), '🐾'.repeat(18) + 'a', 'a'.repeat(70) + '虎'])('blocks oversized registration before dispatch', async (password) => {
    const wrapper = createWrapper()
    await wrapper.get('.tabs button:nth-child(2)').trigger('click')
    await wrapper.get('input[type="password"]').setValue(password)
    await wrapper.get('form').trigger('submit')
    expect(api.register).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders an authoritative server byte-limit rejection and allows a corrected retry', async () => {
    api.register.mockRejectedValueOnce(Object.assign(new Error('English fallback'), { apiCode: 'PASSWORD_TOO_LONG', params: { maxBytes: 72 } })).mockResolvedValueOnce(success)
    const wrapper = createWrapper()
    await wrapper.get('.tabs button:nth-child(2)').trigger('click')
    await wrapper.get('input[type="password"]').setValue('a'.repeat(72))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('72')
    expect((wrapper.get('input[type="password"]').element as HTMLInputElement).value.length).toBe(72)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.emitted('authenticated')).toHaveLength(1)
    wrapper.unmount()
  })

  it.each(['close', 'guest', 'switch-mode', 'account-switch'])('%s prevents stale registration completion', async (action) => {
    let finish!: (value: unknown) => void
    api.register.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const wrapper = createWrapper()
    await wrapper.get('.tabs button:nth-child(2)').trigger('click')
    await wrapper.get('input[type="password"]').setValue('a'.repeat(72))
    await wrapper.get('form').trigger('submit')
    if (action === 'close') await wrapper.get('.close-btn').trigger('click')
    if (action === 'guest') await wrapper.get('.guest-link').trigger('click')
    if (action === 'switch-mode') await wrapper.get('.tabs button:first-child').trigger('click')
    if (action === 'account-switch') { localStorage.setItem('token', 'other-fixture-session'); invalidateAuthContext() }
    finish(success)
    await flushPromises()
    expect(wrapper.emitted('authenticated')).toBeUndefined()
    expect(localStorage.getItem('token')).toBe(action === 'account-switch' ? 'other-fixture-session' : null)
    wrapper.unmount()
  })
})
