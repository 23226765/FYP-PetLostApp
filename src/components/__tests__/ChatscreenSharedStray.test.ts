import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import Chatscreen from '../Chatscreen.vue'
import { setSessionToken } from '../../services/authSession'

const apiMocks = vi.hoisted(() => ({ getMessages: vi.fn(), sendMessage: vi.fn(), uploadManagedImage: vi.fn(), discardManagedImage: vi.fn() }))
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
  it('retains retry identity for unchanged messages and rotates it after a payload edit', async () => {
    const { wrapper } = await render({})
    apiMocks.sendMessage.mockRejectedValue(new Error('lost response'))
    const input = wrapper.get('textarea, input[type="text"]')
    await input.setValue('Hello')
    await wrapper.get('.send-btn').trigger('click'); await flushPromises()
    await wrapper.get('.send-btn').trigger('click'); await flushPromises()
    expect(apiMocks.sendMessage.mock.calls[0][1].clientRequestId).toBe(apiMocks.sendMessage.mock.calls[1][1].clientRequestId)
    await input.setValue('Changed')
    await wrapper.get('.send-btn').trigger('click'); await flushPromises()
    expect(apiMocks.sendMessage.mock.calls[2][1].clientRequestId).not.toBe(apiMocks.sendMessage.mock.calls[1][1].clientRequestId)
    wrapper.unmount()
  })
  beforeEach(() => { vi.useFakeTimers(); apiMocks.getMessages.mockReset(); apiMocks.sendMessage.mockReset() })
  afterEach(() => vi.useRealTimers())

  it('opens the canonical stray route from a message preview', async () => {
    const { wrapper, router } = await render({ sharedStray: { id: 'stray-one', species: 'Cat', animalType: '', description: 'Ginger cat', photo: '', location: 'Market', district: 'Wan Chai', rescueStatus: 'reported' } })
    await wrapper.get('.shared-post').trigger('click'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/strays/stray-one')
    wrapper.unmount()
  })

  it('renders a graceful unavailable state for a deleted shared post', async () => {
    const { wrapper } = await render({ sharedStrayUnavailable: true })
    expect(wrapper.text()).toContain('This post is no longer available.')
    wrapper.unmount()
  })

  it('account switching between submission and dispatch cannot send under the new identity', async () => {
    setSessionToken('old-finder-fixture')
    const { wrapper } = await render({})
    await wrapper.get('textarea, input[type="text"]').setValue('Old account draft')
    const click = wrapper.get('.send-btn').trigger('click')
    setSessionToken('new-user-fixture')
    await click; await flushPromises()
    expect(apiMocks.sendMessage).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('sends image attachments using multipart and a server-issued ID, never Base64', async () => {
    localStorage.setItem('token', 'fictional-chat-test')
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fictional-message')
    const id = 'b'.repeat(24)
    apiMocks.uploadManagedImage.mockResolvedValue({ id })
    apiMocks.sendMessage.mockResolvedValue({ id: 'message-new', petId: pet.id, sender: 'finder', text: '', photo: `/api/uploads/managed/${id}/content`, createdAt: new Date().toISOString() })
    const { wrapper } = await render({})
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['raster'], 'chat.png', { type: 'image/png' })] })
    await input.trigger('change'); await wrapper.get('.send-btn').trigger('click'); await flushPromises()
    expect(apiMocks.uploadManagedImage.mock.calls[0][1]).toBe('message')
    expect(apiMocks.sendMessage).toHaveBeenCalledWith(pet.id, expect.objectContaining({ imageIds: [id], clientRequestId: expect.any(String) }))
    expect(apiMocks.sendMessage.mock.calls[0][1]).not.toHaveProperty('photo')
    expect(wrapper.find('.attachment-preview').exists()).toBe(false)
    wrapper.unmount()
  })
})
