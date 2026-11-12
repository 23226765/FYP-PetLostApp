import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import ProfilePhotoCard from '../profile/ProfilePhotoCard.vue'
import ProfileStrayCard from '../profile/ProfileStrayCard.vue'
import MyPetsTab from '../profile/MyPetsTab.vue'
import MyRescuePostsTab from '../profile/MyRescuePostsTab.vue'
import photoCardSource from '../profile/ProfilePhotoCard.vue?raw'
import { i18n } from '../../i18n'
import type { Pet } from '../../types/pet'
import type { StrayReport } from '../../types/stray'

const api = vi.hoisted(() => ({
  getMyPetsPage: vi.fn(),
  getMyStraysPage: vi.fn(),
  readManagedImage: vi.fn(),
}))
vi.mock('../../services/api', () => api)

const dogPhoto = '/test-photos/dog.jpg'
const catPhoto = '/test-photos/cat.jpg'
const gridStyles = readFileSync(`${process.cwd()}/src/components/profile/profileGrid.css`, 'utf8')
const cardProps = {
  title: 'Maple', subtitle: 'Collie', status: 'Lost', statusClass: 'lost',
  accessibleLabel: 'Open Maple', photoAlt: 'Photo of Maple',
}
const pagination = { page: 1, limit: 20, total: 1, totalPages: 1, hasMore: false }
const pet: Pet = {
  id: 'profile-maple', name: 'Maple', species: 'Dog', breed: 'Collie',
  photo: dogPhoto, photos: [dogPhoto], description: '', owner: 'Fictional owner',
  canViewContact: false, status: 'lost', location: 'Sha Tin', locationPrecision: 'approximate',
  lastSeen: '', postedAgo: '', mapX: 50, mapY: 50,
}
const stray: StrayReport = {
  id: 'profile-rescue', species: 'Cat', animalType: '', description: 'Near the park',
  photo: catPhoto, photos: [catPhoto], condition: 'healthy', district: 'Sha Tin',
  location: 'Sha Tin Park', coordinates: null, locationPrecision: 'approximate',
  rescueStatus: 'reported', reporterName: 'Fictional reporter',
  author: { id: 'owner-id', name: 'Fictional reporter', avatar: '' },
  canViewContact: false, reportedBy: 'owner-id', reportedAgo: '',
  observedAt: '2026-11-01T10:00:00.000Z', createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z', statusUpdatedAt: '2026-11-01T10:00:00.000Z',
  commentCount: 2, isSaved: true, canManage: true, canEdit: true, canDelete: true, canUpdateStatus: true,
}

enableAutoUnmount(afterEach)
beforeEach(() => {
  vi.resetAllMocks()
  i18n.global.locale.value = 'en'
  api.readManagedImage.mockRejectedValue(new Error('Image not available to this viewer'))
  api.getMyPetsPage.mockResolvedValue({ pets: [pet], pagination, summary: { total: 1, reunited: 0, active: 1 } })
  api.getMyStraysPage.mockResolvedValue({ strays: [stray], pagination })
})
afterEach(() => { i18n.global.locale.value = 'en' })

describe('Profile photo cards', () => {
  it('shows the attached photo, name, status and accessible entry point', () => {
    const wrapper = mount(ProfilePhotoCard, { props: { ...cardProps, photo: dogPhoto } })
    expect(wrapper.element.tagName).toBe('ARTICLE')
    expect(wrapper.attributes()).toMatchObject({ role: 'link', tabindex: '0', 'aria-label': 'Open Maple' })
    expect(wrapper.get('img').attributes('src')).toBe(new URL(dogPhoto, window.location.origin).href)
    expect(wrapper.get('img').attributes('alt')).toBe('Photo of Maple')
    expect(wrapper.text()).toContain('Maple')
    expect(wrapper.text()).toContain('Collie')
    expect(wrapper.text()).toContain('Lost')
    expect(wrapper.text()).not.toContain('No photo')
    expect(api.readManagedImage).not.toHaveBeenCalled()
  })

  it.each([
    ['en', 'No photo'],
    ['zh-HK', '沒有照片'],
    ['zh-CN', '暂无照片'],
  ] as const)('%s keeps names unchanged and uses a localized paw fallback for missing or placeholder photos', async (locale, fallback) => {
    i18n.global.locale.value = locale
    const wrapper = mount(ProfilePhotoCard, { props: cardProps })
    expect(wrapper.text()).toContain(fallback)
    expect(wrapper.get('.photo-placeholder').attributes()).toMatchObject({ role: 'img', 'aria-label': fallback })
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.text()).toContain('Maple')
    expect(wrapper.find('img').exists()).toBe(false)
    await wrapper.setProps({ photo: 'https://placehold.co/800x800?text=Maple' })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain(fallback)
    expect(wrapper.text()).toContain('Maple')
    expect(api.readManagedImage).not.toHaveBeenCalled()
  })

  it('skips known placeholders and tries only actual attached alternate photos', async () => {
    const wrapper = mount(ProfilePhotoCard, {
      props: { ...cardProps, photo: 'https://placehold.co/800x800', photos: [dogPhoto, dogPhoto, catPhoto] },
    })
    expect(wrapper.get('img').attributes('src')).toContain(dogPhoto)
    await wrapper.get('img').trigger('error')
    expect(wrapper.get('img').attributes('src')).toContain(catPhoto)
    await wrapper.get('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('No photo')
    expect(wrapper.find('svg').exists()).toBe(true)
    await wrapper.setProps({ photo: catPhoto, photos: [catPhoto] })
    expect(wrapper.get('img').attributes('src')).toContain(catPhoto)
    expect(wrapper.text()).not.toContain('No photo')
  })

  it('retains permission checked managed-image delivery and falls back after a denied read', async () => {
    const protectedPhoto = `/api/uploads/managed/${'a'.repeat(24)}/content`
    const wrapper = mount(ProfilePhotoCard, { props: { ...cardProps, photo: protectedPhoto } })
    await flushPromises()
    expect(api.readManagedImage).toHaveBeenCalledWith(`/uploads/managed/${'a'.repeat(24)}/content`, expect.any(AbortSignal))
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('No photo')
    expect(wrapper.html()).not.toContain('cloudinary')
  })

  it('opens by click, Enter and Space, while ignoring unrelated keys and nested interactive controls', async () => {
    const wrapper = mount(ProfilePhotoCard, {
      props: cardProps,
      slots: { default: '<button class="nested-action"><span>Action</span></button><a href="#nested">Link</a><input aria-label="Note" />' },
    })
    await wrapper.trigger('click')
    await wrapper.trigger('keydown', { key: 'Enter' })
    await wrapper.trigger('keydown', { key: ' ' })
    await wrapper.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('open')).toEqual([[], [], []])
    for (const selector of ['.nested-action span', 'a', 'input']) {
      for (const key of ['Enter', ' ']) {
        const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
        wrapper.get(selector).element.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
      }
      await wrapper.get(selector).trigger('click')
    }
    expect(wrapper.emitted('open')).toHaveLength(3)
  })

  it('keeps the square photo and narrow-screen grid CSS contracts', () => {
    // jsdom does not perform layout: these checks cover declared geometry only.
    expect(photoCardSource).toMatch(/aspect-ratio\s*:\s*1(?:\s*\/\s*1)?\s*;/)
    expect(photoCardSource).toMatch(/object-fit\s*:\s*cover/)
    expect(gridStyles).toMatch(/\.profile-post-grid\s*\{[^}]*display\s*:\s*grid/)
    expect(gridStyles).toMatch(/grid-template-columns\s*:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
    expect(gridStyles).toMatch(/@media[^{]*max-width\s*:\s*299px[^{]*\{\s*\.profile-post-grid\s*\{[^}]*grid-template-columns\s*:\s*(?:1fr|minmax\(0,\s*1fr\))/)
  })
})

describe('Profile grid integration', () => {
  it.each(['en', 'zh-HK', 'zh-CN'] as const)('%s uses shared photo cards for My pets and authored rescue posts, preserving authored names', async locale => {
    i18n.global.locale.value = locale
    const pets = mount(MyPetsTab, { props: { userId: 'owner-id', active: true, refreshKey: 0 } })
    const rescue = mount(MyRescuePostsTab, { props: { userId: 'owner-id', active: true, refreshKey: 0 } })
    await flushPromises()
    expect(pets.get('.profile-post-grid .profile-photo-card').text()).toContain('Maple')
    expect(pets.get('.profile-post-grid img').attributes('src')).toContain(dogPhoto)
    expect(pets.get('.status-badge').text()).toBe(i18n.global.t('pets.lost'))
    expect(rescue.get('.profile-post-grid .profile-photo-card').text()).toContain(i18n.global.t('pets.cat'))
    expect(rescue.get('.profile-post-grid img').attributes('src')).toContain(catPhoto)
    expect(rescue.get('.status-badge').text()).toBe(i18n.global.t('strays.spotted'))
    expect(pets.get('.panel-heading button').text()).toBe(i18n.global.t('profile.addPet'))
    expect(rescue.get('.panel-heading button').text()).toBe(i18n.global.t('profile.newRescuePost'))
    await pets.get('.profile-photo-card').trigger('keydown', { key: ' ' })
    await rescue.get('.profile-photo-card').trigger('click')
    expect(pets.emitted('open-pet')).toEqual([[pet.id]])
    expect(rescue.emitted('open-stray')).toEqual([[stray.id]])
    await pets.get('.panel-heading button').trigger('click')
    await rescue.get('.panel-heading button').trigger('click')
    expect(pets.emitted('add-pet')).toHaveLength(1)
    expect(rescue.emitted('create-rescue')).toHaveLength(1)
  })

  it('keeps creation actions at the top through loading, failure and empty states', async () => {
    api.getMyPetsPage.mockRejectedValueOnce(new Error('Unavailable'))
    api.getMyStraysPage.mockRejectedValueOnce(new Error('Unavailable'))
    const pets = mount(MyPetsTab, { props: { userId: 'owner-id', active: true, refreshKey: 0 } })
    const rescue = mount(MyRescuePostsTab, { props: { userId: 'owner-id', active: true, refreshKey: 0 } })
    for (const wrapper of [pets, rescue]) {
      expect(wrapper.element.firstElementChild?.classList.contains('panel-heading')).toBe(true)
      expect(wrapper.find('.panel-heading button').exists()).toBe(true)
    }
    await flushPromises()
    expect(pets.find('[role="alert"]').exists()).toBe(true)
    expect(rescue.find('[role="alert"]').exists()).toBe(true)
    api.getMyPetsPage.mockResolvedValueOnce({ pets: [], pagination: { ...pagination, total: 0 }, summary: { total: 0, reunited: 0, active: 0 } })
    api.getMyStraysPage.mockResolvedValueOnce({ strays: [], pagination: { ...pagination, total: 0 } })
    await pets.get('[role="alert"] button').trigger('click')
    await rescue.get('[role="alert"] button').trigger('click')
    await flushPromises()
    for (const wrapper of [pets, rescue]) {
      expect(wrapper.element.firstElementChild?.classList.contains('panel-heading')).toBe(true)
      expect(wrapper.find('.panel-heading button').exists()).toBe(true)
      expect(wrapper.find('.profile-photo-card').exists()).toBe(false)
    }
  })

  it('renders both licensed fixture photos and no-photo entries in each grid without adding requests', async () => {
    const missingPet = { ...pet, id: 'no-photo-pet', name: 'A long fictional pet name for a narrow caption', photo: '', photos: [] }
    const missingRescue = { ...stray, id: 'no-photo-rescue', species: 'Other' as const, animalType: 'Hedgehog', photo: '', photos: [], commentCount: undefined as unknown as number }
    api.getMyPetsPage.mockResolvedValueOnce({ pets: [pet, { ...pet, id: 'cat-pet', name: 'Fictional Cat', species: 'Cat', photo: catPhoto, photos: [catPhoto] }, missingPet], pagination, summary: { total: 3, reunited: 0, active: 3 } })
    api.getMyStraysPage.mockResolvedValueOnce({ strays: [stray, { ...stray, id: 'dog-rescue', species: 'Dog', photo: dogPhoto, photos: [dogPhoto] }, missingRescue], pagination })
    const pets = mount(MyPetsTab, { props: { userId: 'owner-id', active: true, refreshKey: 0 } })
    const rescue = mount(MyRescuePostsTab, { props: { userId: 'owner-id', active: true, refreshKey: 0 } })
    await flushPromises()
    for (const tab of [pets, rescue]) {
      expect(tab.findAll('.profile-photo-card')).toHaveLength(3)
      expect(tab.findAll('.profile-photo img').map(img => new URL(img.attributes('src')!).pathname).sort()).toEqual([catPhoto, dogPhoto])
      expect(tab.findAll('.photo-placeholder')).toHaveLength(1)
      expect(tab.text()).toContain('No photo')
    }
    expect(rescue.findAll('.profile-photo-card')[2]!.text()).toContain('Hedgehog')
    expect(rescue.findAll('.profile-photo-card')[2]!.find('.profile-photo-caption small').exists()).toBe(false)
    expect(pets.text()).toContain(missingPet.name)
    expect(api.getMyPetsPage).toHaveBeenCalledTimes(1)
    expect(api.getMyStraysPage).toHaveBeenCalledTimes(1)
    expect(api.readManagedImage).not.toHaveBeenCalled()
  })

  it('opts authored rescue cards into the grid while preserving the default Saved row and unsave behavior', async () => {
    const grid = mount(ProfileStrayCard, { props: { stray, grid: true } })
    const saved = mount(ProfileStrayCard, { props: { stray, removable: true } })
    expect(grid.findComponent(ProfilePhotoCard).exists()).toBe(true)
    expect(grid.classes()).toContain('profile-stray-card')
    expect(saved.findComponent(ProfilePhotoCard).exists()).toBe(false)
    expect(saved.find('.photo-wrap').exists()).toBe(true)
    expect(saved.find('.card-copy').exists()).toBe(true)
    await saved.get('.unsave').trigger('keydown', { key: 'Enter' })
    await saved.get('.unsave').trigger('keydown', { key: ' ' })
    await saved.get('.unsave').trigger('click')
    expect(saved.emitted('open')).toBeUndefined()
    expect(saved.emitted('unsave')).toEqual([[stray.id]])
    await saved.trigger('click')
    expect(saved.emitted('open')).toEqual([[stray.id]])
  })
})
