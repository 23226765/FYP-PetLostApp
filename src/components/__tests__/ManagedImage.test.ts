import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ManagedImage from '../ManagedImage.vue'
const mocks = vi.hoisted(() => ({ readManagedImage: vi.fn() }))
vi.mock('../../services/api', () => mocks)
describe('permission-checked managed image rendering', () => {
  beforeEach(() => {
    mocks.readManagedImage.mockReset()
    URL.createObjectURL = vi.fn(() => 'blob:permission-checked')
    URL.revokeObjectURL = vi.fn()
  })
  it('leaves legacy external, local and Base64 sources unchanged', async () => {
    for (const src of ['https://example.test/photo.jpg', '/uploads/existing.jpg', 'data:image/png;base64,AAAA']) {
      const wrapper = mount(ManagedImage, { props: { src }, attrs: { alt: 'Fictional pet' } })
      expect(wrapper.get('img').attributes('src')).toBe(src)
      expect(wrapper.get('img').attributes('alt')).toBe('Fictional pet')
      wrapper.unmount()
    }
    expect(mocks.readManagedImage).not.toHaveBeenCalled()
  })
  it('renders attached images from an authenticated backend blob without provider URLs', async () => {
    mocks.readManagedImage.mockResolvedValue(new Blob(['safe'], { type: 'image/webp' }))
    const wrapper = mount(ManagedImage, { props: { src: `/api/uploads/managed/${'a'.repeat(24)}/content` } })
    await flushPromises()
    expect(mocks.readManagedImage).toHaveBeenCalledWith(`/uploads/managed/${'a'.repeat(24)}/content`, expect.any(AbortSignal))
    expect(wrapper.get('img').attributes('src')).toBe('blob:permission-checked')
    expect(wrapper.html()).not.toContain('cloudinary')
    wrapper.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:permission-checked')
  })
  it('clears privileged blobs on logout and emits a real image error for existing fallbacks', async () => {
    mocks.readManagedImage.mockResolvedValueOnce(new Blob(['safe'])).mockRejectedValueOnce(new Error('Forbidden'))
    const wrapper = mount(ManagedImage, { props: { src: `/api/uploads/managed/${'b'.repeat(24)}/content` } })
    await flushPromises()
    window.dispatchEvent(new Event('auth:unauthorized')); await flushPromises()
    expect(wrapper.get('img').attributes('src')).toBeUndefined()
    expect(wrapper.emitted('error')?.[0]?.[0]).toBeInstanceOf(Event)
    wrapper.unmount()
  })
})
