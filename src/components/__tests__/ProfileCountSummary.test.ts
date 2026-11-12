import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '../../i18n'
import type { Pet } from '../../types/pet'
import type { User } from '../../types/user'
import ProfileScreen from '../ProfileScreen.vue'
import MyPetsTab from '../profile/MyPetsTab.vue'

const api = vi.hoisted(() => ({
  getMyPetsPage: vi.fn(),
  getMySightings: vi.fn(),
  getMyStraysPage: vi.fn(),
  getSavedStraysPage: vi.fn(),
  setStraySaved: vi.fn(),
}))
vi.mock('../../services/api', () => api)

const owner: User = { id: 'summary-owner', name: 'Fictional Owner', email: 'summary.owner@example.test' }
const nextOwner: User = { id: 'next-summary-owner', name: 'Next Owner', email: 'next.owner@example.test' }
const pagination = { page: 1, limit: 20, total: 0, totalPages: 1, hasMore: false }
const pet: Pet = {
  id: 'summary-pet', name: 'Maple', species: 'Dog', breed: 'Collie',
  photo: '', photos: [], description: '', owner: owner.name,
  canViewContact: false, status: 'lost', location: 'Sha Tin', locationPrecision: 'approximate',
  lastSeen: '', postedAgo: '', mapX: 50, mapY: 50,
}

function pageResponse(active = 0, reunited = 0, pets: Pet[] = []) {
  return { pets, pagination: { ...pagination, total: active + reunited }, summary: { total: active + reunited, active, reunited } }
}

function sightings(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `summary-sighting-${index}` }))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function mountProfile(user: User | null = owner, initialRoute = '/profile') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/profile', name: 'profile', component: { template: '<div />' } },
      { path: '/pets/:id', name: 'pet-detail', component: { template: '<div />' } },
      { path: '/strays/:id', name: 'stray-detail', component: { template: '<div />' } },
      { path: '/settings', name: 'settings', component: { template: '<div />' } },
    ],
  })
  await router.push(initialRoute)
  await router.isReady()
  const wrapper = mount(ProfileScreen, { attachTo: document.body, props: { user }, global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

enableAutoUnmount(afterEach)
beforeEach(() => {
  vi.resetAllMocks()
  i18n.global.locale.value = 'en'
  api.getMyPetsPage.mockResolvedValue(pageResponse())
  api.getMySightings.mockResolvedValue([])
  api.getMyStraysPage.mockResolvedValue({ strays: [], pagination: { ...pagination, total: 73 } })
  api.getSavedStraysPage.mockResolvedValue({ strays: [], pagination: { ...pagination, total: 91 }, unavailableCount: 0 })
  api.setStraySaved.mockResolvedValue(false)
})
afterEach(() => { i18n.global.locale.value = 'en' })

describe('Profile count summaries', () => {
  it.each([
    ['en', 0, "You've submitted 0 sightings.", '0 open lost-pet reports · 0 reunited'],
    ['en', 1, "You've submitted 1 sighting.", '1 open lost-pet report · 1 reunited'],
    ['en', 2, "You've submitted 2 sightings.", '2 open lost-pet reports · 2 reunited'],
    ['zh-HK', 0, '你已提交 0 則目擊報告。', '0 則未結案尋寵報告 · 0 隻已團聚'],
    ['zh-HK', 1, '你已提交 1 則目擊報告。', '1 則未結案尋寵報告 · 1 隻已團聚'],
    ['zh-HK', 2, '你已提交 2 則目擊報告。', '2 則未結案尋寵報告 · 2 隻已團聚'],
    ['zh-CN', 0, '你已提交 0 条目击报告。', '0 条进行中的寻宠报告 · 0 只已团聚'],
    ['zh-CN', 1, '你已提交 1 条目击报告。', '1 条进行中的寻宠报告 · 1 只已团聚'],
    ['zh-CN', 2, '你已提交 2 条目击报告。', '2 条进行中的寻宠报告 · 2 只已团聚'],
  ] as const)('%s renders successful count %i with localized wording', async (locale, count, sightingText, petText) => {
    i18n.global.locale.value = locale
    api.getMyPetsPage.mockResolvedValue(pageResponse(count, count))
    api.getMySightings.mockResolvedValue(sightings(count))
    const { wrapper } = await mountProfile()
    expect(wrapper.get('.sighting-summary').text()).toBe(sightingText)
    expect(wrapper.get('.pet-summary').text()).toBe(petText)
  })

  it('places plain text below the header and My pets heading without the old stat strip', async () => {
    api.getMyPetsPage.mockResolvedValue(pageResponse(4, 3, [pet]))
    api.getMySightings.mockResolvedValue(sightings(2))
    const { wrapper } = await mountProfile()
    const sightingLine = wrapper.get('.sighting-summary')
    const petLine = wrapper.get('.pet-summary')
    expect(wrapper.find('.stats').exists()).toBe(false)
    expect(wrapper.find('.stat').exists()).toBe(false)
    expect(sightingLine.element.tagName).toBe('P')
    expect(wrapper.get('.profile-topbar').element.nextElementSibling).toBe(sightingLine.element)
    expect(sightingLine.element.closest('button, a, [role="button"], [role="link"]')).toBeNull()
    expect(sightingLine.find('button, a').exists()).toBe(false)
    expect(sightingLine.attributes('tabindex')).toBeUndefined()
    expect(petLine.element.tagName).toBe('P')
    const heading = wrapper.get('#profile-panel-pets .panel-heading h2')
    expect(heading.element.nextElementSibling).toBe(petLine.element)
    expect(petLine.element.parentElement).toBe(heading.element.parentElement)
    expect(petLine.element.closest('button, a, [role="button"], [role="link"]')).toBeNull()
  })

  it('uses complete API summary totals across pet pages and excludes rescue and saved totals', async () => {
    api.getMyPetsPage.mockResolvedValueOnce({
      ...pageResponse(42, 8, [pet]),
      pagination: { ...pagination, total: 50, totalPages: 3, hasMore: true },
    }).mockResolvedValueOnce({
      ...pageResponse(42, 8, [{ ...pet, id: 'summary-page-two', name: 'Pixel' }]),
      pagination: { ...pagination, page: 2, total: 50, totalPages: 3, hasMore: false },
    })
    const { wrapper } = await mountProfile()
    expect(wrapper.findAll('.my-pet')).toHaveLength(1)
    expect(wrapper.get('.pet-summary').text()).toBe('42 open lost-pet reports · 8 reunited')
    await wrapper.get('.load-more').trigger('click')
    await flushPromises()
    expect(api.getMyPetsPage.mock.calls[1]?.[0]).toEqual({ page: 2, limit: 20 })
    expect(wrapper.findAll('.my-pet')).toHaveLength(2)
    expect(wrapper.get('.pet-summary').text()).toBe('42 open lost-pet reports · 8 reunited')
    await wrapper.get('#profile-tab-rescue').trigger('click')
    await flushPromises()
    await wrapper.get('#profile-tab-saved').trigger('click')
    await flushPromises()
    await wrapper.get('#profile-tab-pets').trigger('click')
    await flushPromises()
    expect(api.getMyStraysPage).toHaveBeenCalledTimes(1)
    expect(api.getSavedStraysPage).toHaveBeenCalledTimes(1)
    expect(wrapper.get('.pet-summary').text()).toBe('42 open lost-pet reports · 8 reunited')
  })

  it.each(['rescue', 'saved'])('keeps the pet summary in My pets when viewing %s', async tab => {
    api.getMyPetsPage.mockResolvedValue(pageResponse(7, 2))
    api.getMySightings.mockResolvedValue(sightings(3))
    const { wrapper } = await mountProfile(owner, `/profile?tab=${tab}`)
    expect(wrapper.get('.sighting-summary').isVisible()).toBe(true)
    expect(wrapper.findAll('.pet-summary').filter(line => line.isVisible())).toHaveLength(0)
    expect(wrapper.get(`#profile-panel-${tab}`).find('.pet-summary').exists()).toBe(false)
    await wrapper.get('#profile-tab-pets').trigger('click')
    await flushPromises()
    expect(wrapper.get('.pet-summary').isVisible()).toBe(true)
    expect(wrapper.get('.pet-summary').text()).toBe('7 open lost-pet reports · 2 reunited')
  })

  it('shows neither count while initial requests are pending, then accepts successful zero', async () => {
    const pets = deferred<ReturnType<typeof pageResponse>>()
    const submitted = deferred<ReturnType<typeof sightings>>()
    api.getMyPetsPage.mockReturnValueOnce(pets.promise)
    api.getMySightings.mockReturnValueOnce(submitted.promise)
    const { wrapper } = await mountProfile()
    expect(wrapper.find('.sighting-summary').exists()).toBe(false)
    expect(wrapper.find('.pet-summary').exists()).toBe(false)
    pets.resolve(pageResponse())
    submitted.resolve([])
    await flushPromises()
    expect(wrapper.get('.sighting-summary').text()).toBe("You've submitted 0 sightings.")
    expect(wrapper.get('.pet-summary').text()).toBe('0 open lost-pet reports · 0 reunited')
  })

  it('does not present initial failed requests as successful zero counts', async () => {
    api.getMyPetsPage.mockRejectedValueOnce(new Error('Pets unavailable'))
    api.getMySightings.mockRejectedValueOnce(new Error('Sightings unavailable'))
    const { wrapper } = await mountProfile()
    expect(wrapper.find('.sighting-summary').exists()).toBe(false)
    expect(wrapper.find('.pet-summary').exists()).toBe(false)
    expect(wrapper.find('#profile-panel-pets [role="alert"]').exists()).toBe(true)
  })

  it('does not fetch or display count summaries for a guest', async () => {
    const { wrapper } = await mountProfile(null)
    expect(wrapper.find('.sighting-summary').exists()).toBe(false)
    expect(wrapper.find('.pet-summary').exists()).toBe(false)
    expect(api.getMySightings).not.toHaveBeenCalled()
    expect(api.getMyPetsPage).not.toHaveBeenCalled()
  })

  it.each([
    undefined,
    null,
    {},
    { active: 2 },
    { active: -1, reunited: 0 },
    { active: 2, reunited: -1 },
    { active: Number.NaN, reunited: 0 },
    { active: 2, reunited: Number.POSITIVE_INFINITY },
    { active: '2', reunited: 0 },
    { active: 2, reunited: 0.5 },
  ])('hides missing or invalid pet summary %j instead of inventing zero', async summary => {
    api.getMyPetsPage.mockResolvedValueOnce({ pets: [pet], pagination: { ...pagination, total: 1 }, summary })
    const wrapper = mount(MyPetsTab, { props: { userId: owner.id, active: true, refreshKey: 0 } })
    await flushPromises()
    expect(wrapper.find('.pet-summary').exists()).toBe(false)
    expect(wrapper.find('.my-pet').exists()).toBe(true)
  })

  it('hides the previous pet totals during a return refresh and after its failure', async () => {
    api.getMyPetsPage.mockResolvedValueOnce(pageResponse(12, 4, [pet]))
    const { wrapper, router } = await mountProfile()
    expect(wrapper.get('.pet-summary').text()).toBe('12 open lost-pet reports · 4 reunited')
    const refresh = deferred<ReturnType<typeof pageResponse>>()
    api.getMyPetsPage.mockReturnValueOnce(refresh.promise)
    await router.push('/settings')
    await router.push('/profile')
    await flushPromises()
    expect(api.getMyPetsPage).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.pet-summary').exists()).toBe(false)
    refresh.reject(new Error('Refresh unavailable'))
    await flushPromises()
    expect(wrapper.find('.pet-summary').exists()).toBe(false)
    expect(wrapper.find('.my-pet').exists()).toBe(true)
  })

  it('replaces pet totals only after a successful reload, including zero', async () => {
    api.getMyPetsPage.mockResolvedValueOnce(pageResponse(9, 5, [pet]))
    const wrapper = mount(MyPetsTab, { props: { userId: owner.id, active: true, refreshKey: 0 } })
    await flushPromises()
    const refresh = deferred<ReturnType<typeof pageResponse>>()
    api.getMyPetsPage.mockReturnValueOnce(refresh.promise)
    await wrapper.setProps({ refreshKey: 1 })
    expect(wrapper.find('.pet-summary').exists()).toBe(false)
    refresh.resolve(pageResponse())
    await flushPromises()
    expect(wrapper.get('.pet-summary').text()).toBe('0 open lost-pet reports · 0 reunited')
  })

  it('clears prior account counts while the replacement account loads and after failure', async () => {
    api.getMyPetsPage.mockResolvedValueOnce(pageResponse(18, 6))
    api.getMySightings.mockResolvedValueOnce(sightings(11))
    const { wrapper } = await mountProfile()
    const pets = deferred<ReturnType<typeof pageResponse>>()
    const submitted = deferred<ReturnType<typeof sightings>>()
    api.getMyPetsPage.mockReturnValueOnce(pets.promise)
    api.getMySightings.mockReturnValueOnce(submitted.promise)
    await wrapper.setProps({ user: nextOwner })
    expect(wrapper.find('.sighting-summary').exists()).toBe(false)
    expect(wrapper.find('.pet-summary').exists()).toBe(false)
    pets.reject(new Error('Replacement pets unavailable'))
    submitted.reject(new Error('Replacement sightings unavailable'))
    await flushPromises()
    expect(wrapper.find('.sighting-summary').exists()).toBe(false)
    expect(wrapper.find('.pet-summary').exists()).toBe(false)
  })

  it('ignores old account responses that arrive after the new account counts', async () => {
    const oldPets = deferred<ReturnType<typeof pageResponse>>()
    const oldSightings = deferred<ReturnType<typeof sightings>>()
    const newPets = deferred<ReturnType<typeof pageResponse>>()
    const newSightings = deferred<ReturnType<typeof sightings>>()
    api.getMyPetsPage.mockReturnValueOnce(oldPets.promise).mockReturnValueOnce(newPets.promise)
    api.getMySightings.mockReturnValueOnce(oldSightings.promise).mockReturnValueOnce(newSightings.promise)
    const { wrapper } = await mountProfile()
    await wrapper.setProps({ user: nextOwner })
    newPets.resolve(pageResponse(2, 1))
    newSightings.resolve(sightings(3))
    await flushPromises()
    expect(wrapper.get('.sighting-summary').text()).toBe("You've submitted 3 sightings.")
    expect(wrapper.get('.pet-summary').text()).toBe('2 open lost-pet reports · 1 reunited')
    oldPets.resolve(pageResponse(90, 45))
    oldSightings.resolve(sightings(60))
    await flushPromises()
    expect(wrapper.get('.sighting-summary').text()).toBe("You've submitted 3 sightings.")
    expect(wrapper.get('.pet-summary').text()).toBe('2 open lost-pet reports · 1 reunited')
  })

  it('does not restore account counts after signing out with requests pending', async () => {
    const pets = deferred<ReturnType<typeof pageResponse>>()
    const submitted = deferred<ReturnType<typeof sightings>>()
    api.getMyPetsPage.mockReturnValueOnce(pets.promise)
    api.getMySightings.mockReturnValueOnce(submitted.promise)
    const { wrapper } = await mountProfile()
    await wrapper.setProps({ user: null })
    pets.resolve(pageResponse(21, 8))
    submitted.resolve(sightings(13))
    await flushPromises()
    expect(wrapper.find('.sighting-summary').exists()).toBe(false)
    expect(wrapper.find('.pet-summary').exists()).toBe(false)
  })
})
