import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { User } from '../../types/user'
import SettingsScreen from '../SettingsScreen.vue'
import { applyAccountPreferences } from '../../composables/usePreferences'

const apiMocks = vi.hoisted(() => ({
  getContactPrivacy: vi.fn(),
  updateContactPrivacy: vi.fn(),
  updateProfile: vi.fn(),
  updateUserPreferences: vi.fn(),
}))

vi.mock('../../services/api', () => apiMocks)

const user: User = {
  id: 'owner-id',
  name: 'FYP Owner',
  email: 'fyp.owner@pawradar.test',
  phone: '+852 5000 0101',
  privacy: { contactVisibility: 'private' },
}

async function mountSettings() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/settings', component: { template: '<div />' } },
      { path: '/saved', component: { template: '<div />' } },
      { path: '/my-reports', component: { template: '<div />' } },
    ],
  })
  await router.push('/settings')
  await router.isReady()
  const wrapper = mount(SettingsScreen, {
    props: { user, alertsEnabled: true, radiusKm: 5 },
    global: {
      plugins: [router],
      stubs: { AppIcon: { template: '<span />' } },
    },
  })
  await flushPromises()
  return wrapper
}

describe('SettingsScreen contact privacy', () => {
  beforeEach(() => {
    apiMocks.getContactPrivacy.mockReset()
    apiMocks.updateContactPrivacy.mockReset()
    apiMocks.updateProfile.mockReset()
    apiMocks.updateUserPreferences.mockReset()
    localStorage.clear()
    applyAccountPreferences({ language: 'en', theme: 'light' })
    apiMocks.getContactPrivacy.mockResolvedValue({ contactVisibility: 'private' })
  })

  it('loads the current setting and saves an accessible radio selection', async () => {
    apiMocks.updateContactPrivacy.mockResolvedValue({ contactVisibility: 'authenticated' })
    const wrapper = await mountSettings()
    const radios = wrapper.findAll('.contact-privacy input[type="radio"]')
    expect(radios).toHaveLength(2)
    expect(wrapper.get('.contact-privacy legend').text()).toBe('Contact privacy')
    expect(wrapper.findAll('.privacy-option')).toHaveLength(2)
    expect(wrapper.findAll('.privacy-option.option-card')).toHaveLength(2)
    expect(wrapper.findAll('.privacy-option .radio-indicator')).toHaveLength(2)
    expect(wrapper.get('.save-privacy-button').attributes('type')).toBe('button')
    expect((radios[0].element as HTMLInputElement).checked).toBe(true)

    await radios[1].setValue(true)
    expect(wrapper.findAll('.privacy-option')[0].classes()).not.toContain('selected')
    expect(wrapper.findAll('.privacy-option')[1].classes()).toContain('selected')
    await wrapper.get('.save-privacy-button').trigger('click')
    await flushPromises()

    expect(apiMocks.updateContactPrivacy).toHaveBeenCalledWith('authenticated')
    expect(wrapper.text()).toContain('Signed-in users can now access Call and WhatsApp options.')
    expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({
      privacy: { contactVisibility: 'authenticated' },
    })
  })

  it('shows a safe error without changing the current-user state', async () => {
    apiMocks.updateContactPrivacy.mockRejectedValue(new Error('Unable to save preference.'))
    const wrapper = await mountSettings()
    await wrapper.findAll('.contact-privacy input[type="radio"]')[1].setValue(true)
    await wrapper.get('.save-privacy-button').trigger('click')
    await flushPromises()
    expect(wrapper.get('.privacy-message.error').text()).toBe('Unable to save contact privacy.')
    expect(wrapper.emitted('updated')).toBeUndefined()
  })

  it('changes anonymous language and theme immediately with accessible controls', async () => {
    const wrapper = await mountSettings()
    const language = wrapper.get('input[name="app-language"][value="zh-HK"]')
    const dark = wrapper.get('input[name="app-theme"][value="dark"]')

    expect(wrapper.findAll('.segmented-control .option-card')).toHaveLength(5)
    expect(wrapper.findAll('.segmented-control .radio-indicator')).toHaveLength(5)

    await language.setValue(true)
    await dark.setValue(true)
    await flushPromises()

    expect(document.documentElement.lang).toBe('zh-HK')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(wrapper.text()).toContain('語言與外觀')
    expect(JSON.parse(localStorage.getItem('pawradar_preferences_v1') || '{}')).toEqual({
      language: 'zh-HK',
      theme: 'dark',
    })
  })

  it('keeps radios keyboard-focusable and exposes disabled state on the full option card', async () => {
    const wrapper = await mountSettings()
    const firstRadio = wrapper.get('.privacy-option input[type="radio"]')

    expect((firstRadio.element as HTMLInputElement).tabIndex).toBe(0)
    expect((firstRadio.element as HTMLInputElement).matches(':disabled')).toBe(false)
    expect(wrapper.get('.privacy-option').text()).toContain('Private')

    apiMocks.getContactPrivacy.mockImplementation(() => new Promise(() => {}))
    const loadingWrapper = await mountSettings()
    const disabledRadio = loadingWrapper.get('.privacy-option input[type="radio"]')
    expect((disabledRadio.element as HTMLInputElement).matches(':disabled')).toBe(true)
    expect(loadingWrapper.get('.contact-privacy').attributes('disabled')).toBeDefined()
  })

  it('rolls authenticated preference UI back when the API save fails', async () => {
    localStorage.setItem('token', 'test-token')
    apiMocks.updateUserPreferences.mockRejectedValue(Object.assign(new Error('failed'), {
      apiCode: 'UNSUPPORTED_THEME',
    }))
    const wrapper = await mountSettings()
    await wrapper.get('input[name="app-theme"][value="dark"]').setValue(true)
    await flushPromises()

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(wrapper.get('.preference-message.error').text()).toContain('previous selection has been restored')
  })
})
