import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import Chatscreen from '../Chatscreen.vue'

const apiMocks = vi.hoisted(() => ({ getMessages: vi.fn(), sendMessage: vi.fn() }))
vi.mock('../../services/api', () => apiMocks)
vi.mock('@capacitor/camera', () => ({ Camera: { getPhoto: vi.fn() }, CameraResultType: { DataUrl: 'dataUrl' } }))

const pet = { id: 'pet-one', name: 'Maple', photo: '', owner: 'Owner', canViewContact: false, participantId: 'finder-id' }

async function render(message: Record<string, unknown>) {
  apiMocks.getMessages.mockResolvedValue({ viewerRole: 'finder', messages: [{ id: 'message-one', petId: 'pet-one', sender: 'owner', text: '', createdAt: new Date().toISOString(), ...message }] })
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: { template: '<div />' } }, { path: '/strays/:id', component: { template: '<div />' } },
  ] })
  await router.push('/'); await router.isReady()
  const wrapper = mount(Chatscreen, { props: { pet, user: { id: 'finder-id', name: 'Finder', email: 'finder@example.test' } }, global: { plugins: [router], stubs: { AppIcon: { template: '<span />' } } } })
  await flushPromises()
  return { wrapper, router }
}

describe('structured stray post messages', () => {
  beforeEach(() => { vi.useFakeTimers(); apiMocks.getMessages.mockReset(); apiMocks.sendMessage.mockReset() })
  afterEach(() => vi.useRealTimers())

  it('opens the canonical stray route from a message preview', async () => {
    const { wrapper, router } = await render({ sharedStray: { id: 'stray-one', species: 'Cat', description: 'Ginger cat', photo: '', location: 'Market', district: 'Wan Chai', rescueStatus: 'reported' } })
    await wrapper.get('.shared-post').trigger('click'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/strays/stray-one')
    wrapper.unmount()
  })

  it('renders a graceful unavailable state for a deleted shared post', async () => {
    const { wrapper } = await render({ sharedStrayUnavailable: true })
    expect(wrapper.text()).toContain('This post is no longer available.')
    wrapper.unmount()
  })
})
