import { mount, flushPromises } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import PostPetScreen from '../PostPetScreen.vue'
import { getCurrentLocation } from '../../services/geolocation'
import { setSessionToken } from '../../services/authSession'
const api = vi.hoisted(() => ({ reportLostPet: vi.fn(), uploadManagedImage: vi.fn(), discardManagedImage: vi.fn() }))
vi.mock('../../services/api', () => api)
vi.mock('../../services/geolocation', () => ({ getCurrentLocation: vi.fn().mockResolvedValue({ lng: 114.18, lat: 22.3 }) }))
it('pet report retries reuse uploaded IDs and submission identity without sending image strings', async () => {
  localStorage.setItem('token', 'fictional-pet-test')
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fictional-pet')
  api.uploadManagedImage.mockResolvedValue({ id: 'd'.repeat(24) })
  api.reportLostPet.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce({})
  const wrapper = mount(PostPetScreen, { props: { user: { id: 'owner-id', name: 'Owner', email: 'owner@example.test' } }, global: { stubs: { AppIcon: true, ManagedImage: true } } })
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['raster'], 'pet.png', { type: 'image/png' })] })
  await input.trigger('change')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(wrapper.find('.error-msg').exists()).toBe(true)
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(api.uploadManagedImage).toHaveBeenCalledTimes(1)
  expect(api.uploadManagedImage.mock.calls[0][1]).toBe('pet')
  expect(api.reportLostPet.mock.calls[0][0]).toMatchObject({ imageIds: ['d'.repeat(24)], coordinates: [114.18, 22.3] })
  expect(api.reportLostPet.mock.calls[0][0]).not.toHaveProperty('photo')
  expect(api.reportLostPet.mock.calls[0][0].submissionId).toBe(api.reportLostPet.mock.calls[1][0].submissionId)
  expect(wrapper.find('.success').exists()).toBe(true)
  wrapper.unmount()
})

it.each(['account-switch', 'unmount'])('a pet form paused on GPS cannot submit after %s', async (action) => {
  vi.clearAllMocks()
  setSessionToken('old-owner-fixture')
  let finish!: (value: { lat: number; lng: number }) => void
  vi.mocked(getCurrentLocation).mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
  const wrapper = mount(PostPetScreen, { props: { user: { id: 'old-owner', name: 'Owner', email: 'owner@example.test' } }, global: { stubs: { AppIcon: true, ManagedImage: true } } })
  await wrapper.get('form').trigger('submit')
  if (action === 'account-switch') setSessionToken('new-account-fixture')
  else wrapper.unmount()
  finish({ lat: 22.3, lng: 114.18 }); await flushPromises()
  expect(api.reportLostPet).not.toHaveBeenCalled()
  expect(api.uploadManagedImage).not.toHaveBeenCalled()
  if (action !== 'unmount') wrapper.unmount()
})
