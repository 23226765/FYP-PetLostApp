import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { User } from '../../types/user'
import SettingsScreen from '../SettingsScreen.vue'

const apiMocks = vi.hoisted(() => ({
  getContactPrivacy: vi.fn(),
  updateContactPrivacy: vi.fn(),
  updateProfile: vi.fn(),
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
    apiMocks.getContactPrivacy.mockResolvedValue({ contactVisibility: 'private' })
  })

  it('loads the current setting and saves an accessible radio selection', async () => {
    apiMocks.updateContactPrivacy.mockResolvedValue({ contactVisibility: 'authenticated' })
    const wrapper = await mountSettings()
    const radios = wrapper.findAll('input[type="radio"]')
    expect(radios).toHaveLength(2)
    expect(wrapper.get('fieldset legend').text()).toBe('Contact privacy')
    expect(wrapper.findAll('.privacy-option')).toHaveLength(2)
    expect(wrapper.get('.save-privacy-button').attributes('type')).toBe('button')
    expect((radios[0].element as HTMLInputElement).checked).toBe(true)

    await radios[1].setValue(true)
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
    await wrapper.findAll('input[type="radio"]')[1].setValue(true)
    await wrapper.get('.save-privacy-button').trigger('click')
    await flushPromises()
    expect(wrapper.get('.privacy-message.error').text()).toBe('Unable to save preference.')
    expect(wrapper.emitted('updated')).toBeUndefined()
  })
})
