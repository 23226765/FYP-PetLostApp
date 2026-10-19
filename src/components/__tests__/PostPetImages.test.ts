import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PostPetScreen from '../PostPetScreen.vue'
import { getCurrentLocation } from '../../services/geolocation'
import { setSessionToken } from '../../services/authSession'
import { i18n } from '../../i18n'
const api = vi.hoisted(() => ({ reportLostPet: vi.fn(), uploadManagedImage: vi.fn(), discardManagedImage: vi.fn() }))
vi.mock('../../services/api', () => api)
vi.mock('../../services/geolocation', () => ({ getCurrentLocation: vi.fn() }))
vi.mock('leaflet', () => ({ default: {
  map: vi.fn(() => { throw new Error('Offline map fixture') }),
} }))
enableAutoUnmount(afterEach)
beforeEach(() => {
  vi.resetAllMocks()
  i18n.global.locale.value = 'en'
  setSessionToken('fictional-pet-test')
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fictional-pet')
  api.discardManagedImage.mockResolvedValue(undefined)
  api.uploadManagedImage.mockResolvedValue({ id: 'd'.repeat(24) })
  api.reportLostPet.mockResolvedValue({})
})
afterEach(() => { vi.unstubAllGlobals(); i18n.global.locale.value = 'en' })
function render() {
  return mount(PostPetScreen, { props: { user: { id: 'owner-id', name: 'Owner', email: 'owner@example.test' } }, global: { stubs: { AppIcon: true, ManagedImage: true } } })
}
async function confirm(wrapper: ReturnType<typeof render>) {
  const fields = wrapper.findAll('.coordinate-fields input')
  await fields[0].setValue('22.41')
  await fields[1].setValue('114.21')
  await wrapper.get('.confirm-location').trigger('click')
}
async function selectPhoto(wrapper: ReturnType<typeof render>) {
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['raster'], 'pet.png', { type: 'image/png' })] })
  await input.trigger('change')
}
it('pet report retries reuse uploaded IDs and submission identity with exactly the confirmed lng/lat', async () => {
  api.reportLostPet.mockReset().mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce({})
  const wrapper = render()
  await wrapper.get('input[type="text"]').setValue('Maple')
  await wrapper.get('.input-icon input').setValue('Last seen park')
  await confirm(wrapper); await selectPhoto(wrapper)
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(wrapper.find('.error-msg').exists()).toBe(true)
  expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('Maple')
  expect((wrapper.get('.input-icon input').element as HTMLInputElement).value).toBe('Last seen park')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(api.uploadManagedImage).toHaveBeenCalledTimes(1)
  expect(api.uploadManagedImage.mock.calls[0][1]).toBe('pet')
  expect(api.reportLostPet.mock.calls[0][0]).toMatchObject({ imageIds: ['d'.repeat(24)], coordinates: [114.21, 22.41], locationName: 'Last seen park' })
  expect(api.reportLostPet.mock.calls[0][0]).not.toHaveProperty('photo')
  expect(api.reportLostPet.mock.calls[0][0].submissionId).toBe(api.reportLostPet.mock.calls[1][0].submissionId)
  expect(vi.mocked(getCurrentLocation)).not.toHaveBeenCalled()
  expect(wrapper.find('.success').exists()).toBe(true)
})
it('never submits the display centre, an unconfirmed point, or an invalidated point', async () => {
  const wrapper = render()
  await selectPhoto(wrapper)
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(wrapper.get('.error-msg').text()).toContain('confirm')
  const fields = wrapper.findAll('.coordinate-fields input')
  await fields[0].setValue('22.41'); await fields[1].setValue('114.21')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  await wrapper.get('.confirm-location').trigger('click')
  await fields[0].setValue('999')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(api.reportLostPet).not.toHaveBeenCalled()
  expect(api.uploadManagedImage).not.toHaveBeenCalled()
  expect(vi.mocked(getCurrentLocation)).not.toHaveBeenCalled()
})
it.each(['Permission denied', 'Geolocation unavailable', 'Timed out'])('preserves the form after GPS failure: %s', async (message) => {
  vi.mocked(getCurrentLocation).mockRejectedValue(new Error(message))
  const wrapper = render()
  await wrapper.get('input[type="text"]').setValue('Maple')
  await wrapper.get('.current-location').trigger('click'); await flushPromises()
  expect(wrapper.get('.location-message.error').text()).toContain('permission was denied')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('Maple')
  expect(api.reportLostPet).not.toHaveBeenCalled()
  await confirm(wrapper)
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(api.reportLostPet.mock.calls[0][0].coordinates).toEqual([114.21, 22.41])
})
it.each(['account-switch', 'unmount'])('a pet form paused on upload cannot submit after %s', async (action) => {
  let finish!: (value: { id: string }) => void
  api.uploadManagedImage.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const wrapper = render()
  await confirm(wrapper); await selectPhoto(wrapper)
  await wrapper.get('form').trigger('submit')
  if (action === 'account-switch') setSessionToken('new-account-fixture')
  else wrapper.unmount()
  finish({ id: 'd'.repeat(24) }); await flushPromises()
  expect(api.reportLostPet).not.toHaveBeenCalled()
  expect(api.uploadManagedImage).toHaveBeenCalledTimes(1)
  if (action === 'account-switch') {
    expect(wrapper.get('.confirm-location').attributes('disabled')).toBeDefined()
    expect(api.discardManagedImage).not.toHaveBeenCalled()
  }
})
it.each(['en', 'zh-HK', 'zh-CN'] as const)('missing secure RNG is a localized recoverable form error in %s', async (locale) => {
  vi.stubGlobal('crypto', {})
  i18n.global.locale.value = locale
  const wrapper = render()
  await wrapper.get('input[type="text"]').setValue('Maple')
  await confirm(wrapper)
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(wrapper.get('.error-msg').text()).toBe(i18n.global.t('reportLocation.secureIdUnavailable'))
  expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('Maple')
  expect(api.reportLostPet).not.toHaveBeenCalled()
  expect(api.uploadManagedImage).not.toHaveBeenCalled()
})
