import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import ContentImageEditor from '../ContentImageEditor.vue'
const api = vi.hoisted(() => ({ uploadManagedImage: vi.fn(), replaceContentImages: vi.fn(), discardManagedImage: vi.fn() }))
vi.mock('../../services/api', () => api)
beforeEach(() => {
  localStorage.setItem('token', 'fictional-editor-token')
  Object.values(api).forEach((fn) => fn.mockReset())
  URL.createObjectURL = vi.fn(() => 'blob:fictional-editor'); URL.revokeObjectURL = vi.fn()
})
for (const type of ['pet', 'sighting', 'stray', 'message'] as const) {
  it(`${type}: replacement failures retain the image ID for an explicit save retry`, async () => {
    const id = 'a'.repeat(24)
    api.uploadManagedImage.mockResolvedValue({ id })
    api.replaceContentImages.mockRejectedValueOnce(new Error('DB failure')).mockResolvedValueOnce([{ id, url: `/api/uploads/managed/${id}/content` }])
    const wrapper = mount(ContentImageEditor, { props: { type, id: 'destination-one' }, global: { stubs: { ManagedImage: true } } })
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['raster'], 'replacement.png', { type: 'image/png' })] })
    await input.trigger('change')
    await wrapper.get('.actions button').trigger('click'); await flushPromises()
    expect(wrapper.emitted('updated')).toBeUndefined()
    expect(wrapper.get('[role="alert"]').text()).not.toContain('DB failure')
    await wrapper.get('.actions button').trigger('click'); await flushPromises()
    expect(api.uploadManagedImage).toHaveBeenCalledTimes(1)
    expect(api.replaceContentImages).toHaveBeenLastCalledWith(type, 'destination-one', [id])
    expect(wrapper.emitted('updated')).toHaveLength(1)
    wrapper.unmount()
  })
}
it('removal is explicit; rescue posts cannot remove their required last photo', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  api.replaceContentImages.mockResolvedValue([])
  const pet = mount(ContentImageEditor, { props: { type: 'pet', id: 'destination-one' } })
  await pet.get('.actions button').trigger('click'); await flushPromises()
  expect(api.replaceContentImages).toHaveBeenCalledWith('pet', 'destination-one', [])
  pet.unmount()
  const stray = mount(ContentImageEditor, { props: { type: 'stray', id: 'destination-two', allowRemove: false } })
  expect(stray.find('.actions button').exists()).toBe(false)
  stray.unmount()
})
