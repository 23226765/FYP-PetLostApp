import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ManagedImage from '../ManagedImage.vue'
import { moderationEvidencePath } from '../../utils/managedImages'
const mocks = vi.hoisted(() => ({ readManagedImage: vi.fn() }))
vi.mock('../../services/api', () => mocks)
describe('permission-checked managed image rendering', () => {
  it('rejects foreign, invalid or token-bearing evidence URLs', () => {
    const path = `/api/moderation/reports/${'d'.repeat(24)}/images/0`
    expect(moderationEvidencePath(path)).toBe(path.slice(4))
    for (const src of [`https://foreign.test${path}`, `${path}?token=secret`, `${path}#token`,
      path.replace('/images/0', '/images/6'), path.replace('d'.repeat(24), 'bad'),
      `${window.location.origin.replace('://', '://user:password@')}${path}`]) {
      expect(moderationEvidencePath(src)).toBeNull()
    }
  })
  beforeEach(() => {
    mocks.readManagedImage.mockReset()
    URL.createObjectURL = vi.fn(() => 'blob:permission-checked')
    URL.revokeObjectURL = vi.fn()
  })
  it('leaves external and Base64 sources unchanged', async () => {
    for (const src of ['https://example.test/photo.jpg', 'data:image/png;base64,AAAA']) {
      const wrapper = mount(ManagedImage, { props: { src }, attrs: { alt: 'Fictional pet' } })
      expect(wrapper.get('img').attributes('src')).toBe(src)
      expect(wrapper.get('img').attributes('alt')).toBe('Fictional pet')
      wrapper.unmount()
    }
    expect(mocks.readManagedImage).not.toHaveBeenCalled()
  })
  it('loads legacy local photos through authenticated blob delivery without putting tokens in URLs', async () => {
    localStorage.setItem('token', 'fictional-legacy-session')
    mocks.readManagedImage.mockResolvedValue(new Blob(['safe'], { type: 'image/webp' }))
    const wrapper = mount(ManagedImage, { props: { src: '/uploads/existing.webp' }, attrs: { alt: 'Fictional sighting' } })
    await flushPromises()
    expect(mocks.readManagedImage).toHaveBeenCalledWith('/uploads/legacy/existing.webp', expect.any(AbortSignal))
    expect(wrapper.get('img').attributes('src')).toBe('blob:permission-checked')
    expect(wrapper.html()).not.toContain('fictional-legacy-session')
    expect(wrapper.html()).not.toContain('/uploads/existing.webp')
    wrapper.unmount()
  })
  it('account switching revokes the old legacy blob and ignores a stale completion', async () => {
    let finish!: (value: Blob) => void
    mocks.readManagedImage.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    mocks.readManagedImage.mockRejectedValueOnce(new Error('Unavailable to the new account'))
    const wrapper = mount(ManagedImage, { props: { src: '/uploads/private.webp' } })
    window.dispatchEvent(new Event('auth:changed')); await flushPromises()
    finish(new Blob(['obsolete'])); await flushPromises()
    expect(wrapper.get('img').attributes('src')).toBeUndefined()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    wrapper.unmount()
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
  it('reads report-scoped evidence through authenticated blobs and revokes it on logout', async () => {
    const id = 'c'.repeat(24)
    mocks.readManagedImage.mockResolvedValueOnce(new Blob(['evidence'], { type: 'image/webp' }))
      .mockRejectedValueOnce(new Error('Moderator role required'))
    const wrapper = mount(ManagedImage, { props: { src: `/api/moderation/reports/${id}/images/0` } })
    await flushPromises()
    expect(mocks.readManagedImage).toHaveBeenCalledWith(`/moderation/reports/${id}/images/0`, expect.any(AbortSignal))
    expect(wrapper.get('img').attributes('src')).toBe('blob:permission-checked')
    window.dispatchEvent(new Event('auth:changed')); await flushPromises()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:permission-checked')
    expect(wrapper.get('img').attributes('src')).toBeUndefined()
    wrapper.unmount()
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
