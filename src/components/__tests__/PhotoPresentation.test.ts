import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'
import UserAvatar from '../UserAvatar.vue'
import PetCard from '../PetCard.vue'
import { attachedPhotoSources, displayImageUrl, photoFallbackKey, profileInitials } from '../../utils/imagePresentation'
import { setSessionToken } from '../../services/authSession'
import { i18n } from '../../i18n'
import type { Pet } from '../../types/pet'

const api = vi.hoisted(() => ({ readManagedImage: vi.fn() }))
vi.mock('../../services/api', () => api)
const assetPath = `/api/uploads/managed/${'a'.repeat(24)}/content`
const secondAsset = `/api/uploads/managed/${'b'.repeat(24)}/content`
const pet: Pet = { id: 'fictional-photo', name: 'Photo test', species: 'Dog', breed: 'Mixed breed', photo: '', owner: 'Fictional owner', description: '', canViewContact: false, status: 'lost', location: 'Sha Tin', locationPrecision: 'approximate', lastSeen: '', postedAgo: '', mapX: 50, mapY: 50 }
beforeEach(() => {
  api.readManagedImage.mockReset()
  URL.createObjectURL = vi.fn(() => 'blob:actual-permission-checked-image')
  URL.revokeObjectURL = vi.fn()
  setSessionToken(null)
  i18n.global.locale.value = 'en'
})

it('distinguishes known seed graphics, absent attachments and genuine failed URLs without substituting animal photos', () => {
  expect(photoFallbackKey('', [])).toBe('photoPresentation.noPhoto')
  expect(photoFallbackKey('https://placehold.co/800x600?text=Fictional')).toBe('photoPresentation.demoPlaceholder')
  expect(photoFallbackKey('/uploads/existing.webp')).toBe('photoPresentation.unavailable')
  expect(displayImageUrl('https://placehold.co/800x600')).toBe('')
  expect(displayImageUrl('javascript:alert(1)')).toBe('')
  expect(attachedPhotoSources('https://placehold.co/800x600', [assetPath, assetPath])).toEqual([new URL(assetPath, window.location.origin).href])
  expect(displayImageUrl('/test-photos/dog.jpg')).toContain('/test-photos/dog.jpg')
})

it('uses Unicode-safe initials, with a generic icon when a name is unavailable', () => {
  expect(profileInitials('  Maya   Demo ')).toBe('MD')
  expect(profileInitials('陳大文')).toBe('陳大')
  expect(profileInitials('Leo')).toBe('L')
  expect(profileInitials(' ')).toBe('')
  const avatar = mount(UserAvatar, { props: { name: '', src: '' } })
  expect(avatar.find('img').exists()).toBe(false)
  expect(avatar.find('svg').exists()).toBe(true)
  expect(avatar.attributes('aria-label')).toBe(i18n.global.t('photoPresentation.genericAvatar'))
  avatar.unmount()
})

it.each(['en', 'zh-HK', 'zh-CN'] as const)('%s renders clear localized no-photo/demo fallbacks and profile initials', async locale => {
  i18n.global.locale.value = locale
  const card = mount(PetCard, { props: { pet, feed: true } })
  const avatar = mount(UserAvatar, { props: { name: 'Maya Demo', src: 'https://placehold.co/200?text=Maya' } })
  try {
    expect(card.text()).toContain(i18n.global.t('photoPresentation.noPhoto'))
    await card.setProps({ pet: { ...pet, photo: 'https://placehold.co/800x600?text=Demo' } })
    expect(card.text()).toContain(i18n.global.t('photoPresentation.demoPlaceholder'))
    expect(card.find('img').exists()).toBe(false)
    expect(avatar.text()).toBe('MD')
    expect(avatar.attributes('aria-label')).toContain('Maya Demo')
    expect(api.readManagedImage).not.toHaveBeenCalled()
  } finally { card.unmount(); avatar.unmount() }
})

it('a failed protected read becomes a card fallback instead of a blank image', async () => {
  api.readManagedImage.mockRejectedValue(new Error('Temporary delivery failure'))
  const card = mount(PetCard, { props: { pet: { ...pet, photo: assetPath }, feed: true } })
  try {
    await flushPromises()
    expect(api.readManagedImage).toHaveBeenCalledWith(`/uploads/managed/${'a'.repeat(24)}/content`, expect.any(AbortSignal))
    expect(card.find('img').exists()).toBe(false)
    expect(card.text()).toContain(i18n.global.t('photoPresentation.unavailable'))
    expect(card.html()).not.toContain('cloudinary')
  } finally { card.unmount() }
})

it('handles a blob decoding failure and tries another actually attached photo', async () => {
  api.readManagedImage.mockResolvedValue(new Blob(['safe'], { type: 'image/webp' }))
  const card = mount(PetCard, { props: { pet: { ...pet, photo: assetPath, photos: [assetPath, secondAsset] }, feed: true } })
  try {
    await flushPromises()
    expect(card.get('img').attributes('src')).toBe('blob:actual-permission-checked-image')
    await card.get('img').trigger('error'); await flushPromises()
    expect(api.readManagedImage).toHaveBeenLastCalledWith(`/uploads/managed/${'b'.repeat(24)}/content`, expect.any(AbortSignal))
    await card.get('img').trigger('error'); await flushPromises()
    expect(card.find('.photo-placeholder').exists()).toBe(true)
    await card.setProps({ pet: { ...pet, photo: '/test-photos/dog.jpg' } })
    expect(card.get('img').attributes('src')).toContain('/test-photos/dog.jpg')
  } finally { card.unmount() }
})

it('failed avatars fall back to initials; replacement names/sources reset the fallback', async () => {
  api.readManagedImage.mockRejectedValueOnce(new Error('Not permitted'))
  api.readManagedImage.mockResolvedValueOnce(new Blob(['safe'], { type: 'image/webp' }))
  const avatar = mount(UserAvatar, { props: { name: 'Maya Demo', src: assetPath } })
  try {
    await flushPromises()
    expect(avatar.text()).toBe('MD')
    await avatar.setProps({ name: 'Leo Demo', src: secondAsset }); await flushPromises()
    expect(avatar.get('img').attributes('src')).toBe('blob:actual-permission-checked-image')
    await avatar.get('img').trigger('error')
    expect(avatar.text()).toBe('LD')
  } finally { avatar.unmount() }
})
