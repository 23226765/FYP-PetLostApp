import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import AdoptionHistoryScreen from '../AdoptionHistoryScreen.vue'
import { i18n } from '../../i18n'

const api = vi.hoisted(() => ({ getMyPets: vi.fn(), getMySightings: vi.fn(), updatePetStatus: vi.fn() }))
vi.mock('../../services/api', () => api)
beforeEach(() => { vi.clearAllMocks(); i18n.global.locale.value = 'en'; api.getMySightings.mockResolvedValue([]) })

it.each(['lost', 'sighted'])('activity allows owner reunion for %s posts', async (status) => {
  const pet = { id: 'fictional-pet', name: 'Fictional Maple', species: 'Dog', status, createdAt: '2026-09-20', location: 'Sha Tin', canViewContact: false }
  api.getMyPets.mockResolvedValue([pet])
  api.updatePetStatus.mockResolvedValue({ ...pet, status: 'reunited' })
  const wrapper = mount(AdoptionHistoryScreen, { global: { plugins: [i18n], stubs: { AppIcon: true, ManagedImage: true } } })
  await flushPromises()
  await wrapper.get('.entry-card').trigger('click')
  await wrapper.get('.reunited-action').trigger('click')
  await wrapper.get('.confirm-reunion').trigger('click'); await flushPromises()
  expect(api.updatePetStatus).toHaveBeenCalledWith(pet.id, 'reunited')
  expect(wrapper.get('.celebration-banner').text()).toContain('reunited')
  expect(wrapper.find('.reunited-action').exists()).toBe(false)
  wrapper.unmount()
})
