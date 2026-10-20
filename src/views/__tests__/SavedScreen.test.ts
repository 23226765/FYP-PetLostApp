import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import SavedScreen from '../SavedScreen.vue'
import { activateSavedPetsAccount, useSavedPets } from '../../composables/useSavedPets'
import { captureAuthContext, invalidateAuthContext, setSessionToken } from '../../services/authSession'
import { i18n } from '../../i18n'
import type { Pet } from '../../types/pet'
import type { StrayReport } from '../../types/stray'

const api = vi.hoisted(() => ({ getPet: vi.fn(), getSavedStraysPage: vi.fn() }))
vi.mock('../../services/api', () => api)
const store = useSavedPets()
const user = (id: string) => ({ id, name: id, email: `${id}@example.test` })
const pet = (id: string) => ({ id, name: id, reporterPhone: 'PRIVATE_PHONE' } as unknown as Pet)
const stray = (id: string) => ({ id, species: 'Dog', description: id, photo: '', district: 'Sha Tin', author: { id: 'author', name: 'Fictional author' }, createdAt: '2026-10-20T04:00:00Z' } as StrayReport)
const strayPage = (page = 1, posts: StrayReport[] = [], unavailableCount = 0, total = posts.length + unavailableCount, hasMore = false) => ({ strays: posts, unavailableCount, pagination: { page, limit: 20, total, hasMore } })
function login(id: string) { setSessionToken(`fixture-${id}`); activateSavedPetsAccount(id, captureAuthContext()) }
async function render(account?: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/saved', component: SavedScreen }] })
  await router.push('/saved'); await router.isReady()
  return mount(SavedScreen, { props: { user: account ? user(account) : null }, global: { plugins: [router, i18n], stubs: { PetCard: { props: ['pet'], template: '<p class="saved-pet">{{ pet.name }}</p>' }, ManagedImage: true } } })
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }

describe('saved retrieval is scoped, retryable and accurately paged', () => {
  beforeEach(() => { localStorage.clear(); setSessionToken(null); vi.resetAllMocks(); i18n.global.locale.value = 'en'; api.getSavedStraysPage.mockResolvedValue(strayPage()) })

  it('distinguishes genuinely empty guest saves from all-failed reads; preserves IDs on retry', async () => {
    const empty = await render(); await flushPromises()
    expect(empty.text()).toContain(i18n.global.t('settings.noSaved'))
    expect(api.getPet).not.toHaveBeenCalled(); expect(api.getSavedStraysPage).not.toHaveBeenCalled()
    empty.unmount()
    store.toggleSave('network-pet')
    api.getPet.mockRejectedValueOnce(Object.assign(new Error('outage'), { status: 503 })).mockResolvedValueOnce(pet('network-pet'))
    const wrapper = await render(); await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain(i18n.global.t('settings.noSaved'))
    expect(store.savedPetIds.value).toEqual(['network-pet'])
    await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
    expect(wrapper.findAll('.saved-pet')).toHaveLength(1)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(localStorage.getItem('pawradar_saved_pets:v2:guest')).toBe('["network-pet"]')
    wrapper.unmount()
  })

  it.each(['en', 'zh-HK', 'zh-CN'] as const)('%s preserves successes and generic unavailable results during partial pet and stray failure', async (locale) => {
    i18n.global.locale.value = locale; login('owner')
    for (const id of ['good', 'temporary', 'hidden']) store.toggleSave(id)
    api.getPet.mockImplementation((id: string) => id === 'good' ? Promise.resolve(pet(id)) : Promise.reject(Object.assign(new Error('PRIVATE_MODERATION_REASON'), { status: id === 'hidden' ? 404 : 500 })))
    api.getSavedStraysPage.mockRejectedValueOnce(new Error('temporary stray outage')).mockResolvedValueOnce(strayPage(1, [stray('rescue')]))
    const wrapper = await render('owner'); await flushPromises()
    expect(wrapper.findAll('.saved-pet')).toHaveLength(1)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('PRIVATE_MODERATION_REASON')
    expect(wrapper.text()).not.toContain(i18n.global.t('settings.noSaved'))
    expect(store.savedPetIds.value).toEqual(['good', 'temporary', 'hidden'])
    api.getPet.mockResolvedValue(pet('temporary'))
    await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
    expect(wrapper.findAll('.saved-pet')).toHaveLength(2)
    expect(wrapper.findAll('.saved-stray')).toHaveLength(1)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('.unavailable').exists()).toBe(true)
    expect(localStorage.getItem('pawradar_saved_pets:v2:user:owner')).not.toContain('PRIVATE')
    wrapper.unmount()
  })

  it('all unavailable posts do not become an empty list and retain their IDs', async () => {
    store.toggleSave('unavailable')
    api.getPet.mockRejectedValue(Object.assign(new Error('hidden private detail'), { status: 404 }))
    const wrapper = await render(); await flushPromises()
    expect(wrapper.find('.unavailable').exists()).toBe(true)
    expect(wrapper.find('.empty-state').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('hidden private detail')
    expect(store.savedPetIds.value).toEqual(['unavailable'])
    wrapper.unmount()
  })

  it('keeps every source success when the rescue branch fails, and retries without dropping pet cards', async () => {
    login('owner'); store.toggleSave('good')
    api.getPet.mockResolvedValue(pet('good'))
    api.getSavedStraysPage.mockRejectedValueOnce(new Error('outage')).mockResolvedValueOnce(strayPage())
    const wrapper = await render('owner'); await flushPromises()
    expect(wrapper.findAll('.saved-pet')).toHaveLength(1)
    await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
    expect(wrapper.findAll('.saved-pet')).toHaveLength(1)
    expect(api.getPet).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('paginates IDs with four concurrent requests and leaves later pages reachable after total page failure', async () => {
    for (let i = 0; i < 45; i++) store.toggleSave(`pet-${i}`)
    let current = 0, maximum = 0
    api.getPet.mockImplementation(async (id: string) => {
      current++; maximum = Math.max(maximum, current)
      await Promise.resolve(); current--
      if (Number(id.split('-')[1]) < 20) throw new Error('first page unavailable network')
      return pet(id)
    })
    const wrapper = await render(); await flushPromises()
    expect(api.getPet).toHaveBeenCalledTimes(20)
    expect(maximum).toBeLessThanOrEqual(4)
    expect(wrapper.find('.pets-more').exists()).toBe(true)
    await wrapper.get('.pets-more').trigger('click'); await flushPromises()
    expect(wrapper.findAll('.saved-pet')).toHaveLength(20)
    await wrapper.get('.pets-more').trigger('click'); await flushPromises()
    expect(wrapper.findAll('.saved-pet')).toHaveLength(25)
    expect(wrapper.find('.pets-more').exists()).toBe(false)
    api.getPet.mockImplementation(async (id: string) => pet(id))
    await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
    expect(wrapper.findAll('.saved-pet')).toHaveLength(45)
    expect(store.savedPetIds.value).toHaveLength(45)
    wrapper.unmount()
  })

  it('loads beyond 50 rescue saves, retains server totals, and retries the same failed page without duplicate counts', async () => {
    login('owner')
    api.getSavedStraysPage.mockImplementation(({ page }: { page: number }) => Promise.resolve(strayPage(page, page === 1 ? [] : Array.from({ length: page < 4 ? 20 : 1 }, (_, i) => stray(`page-${page}-${i}`)), page === 1 ? 20 : 0, 61, page < 4)))
    const wrapper = await render('owner'); await flushPromises()
    expect(wrapper.findAll('.saved-stray')).toHaveLength(0)
    expect(wrapper.find('.strays-more').exists()).toBe(true)
    expect(wrapper.find('.empty-state').exists()).toBe(false)
    api.getSavedStraysPage.mockRejectedValueOnce(new Error('page-two outage'))
    await wrapper.get('.strays-more').trigger('click'); await flushPromises()
    expect(wrapper.get('.stray-count').text()).toContain('61')
    await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
    expect(api.getSavedStraysPage.mock.calls.at(-1)?.[0].page).toBe(2)
    for (let page = 3; page <= 4; page++) { await wrapper.get('.strays-more').trigger('click'); await flushPromises() }
    expect(wrapper.findAll('.saved-stray')).toHaveLength(41)
    expect(wrapper.get('.stray-count').text()).toContain('61')
    expect(wrapper.find('.strays-more').exists()).toBe(false)
    expect(wrapper.get('.unavailable').text()).toContain('20')
    wrapper.unmount()
  })

  it.each(['switch', 'logout', 'external-switch', 'unmount'])('%s rejects delayed old pet/rescue completions and clears old content', async action => {
    login('A'); store.toggleSave('old-pet')
    const oldPet = deferred<Pet>(), oldStray = deferred<ReturnType<typeof strayPage>>()
    api.getPet.mockReturnValueOnce(oldPet.promise)
    api.getSavedStraysPage.mockReturnValueOnce(oldStray.promise)
    const wrapper = await render('A'); await flushPromises()
    if (action === 'unmount') wrapper.unmount()
    else if (action === 'logout') { setSessionToken(null); await wrapper.setProps({ user: null }) }
    else {
      if (action === 'external-switch') {
        localStorage.setItem('token', 'external-B')
        window.dispatchEvent(new StorageEvent('storage', { key: 'token', oldValue: 'fixture-A', newValue: 'external-B' }))
        activateSavedPetsAccount('B', captureAuthContext())
      } else login('B')
      await wrapper.setProps({ user: user('B') })
    }
    oldPet.resolve(pet('old-pet')); oldStray.resolve(strayPage(1, [stray('old-rescue')]))
    await flushPromises()
    if (action !== 'unmount') { expect(wrapper.text()).not.toContain('old-pet'); expect(wrapper.text()).not.toContain('old-rescue'); wrapper.unmount() }
    expect(store.savedPetIds.value).toEqual(action === 'unmount' ? ['old-pet'] : [])
  })

  it('synchronously clears already displayed account data before the replacement account is confirmed', async () => {
    login('A'); store.toggleSave('old-pet'); api.getPet.mockResolvedValue(pet('old-pet'))
    const wrapper = await render('A'); await flushPromises()
    expect(wrapper.findAll('.saved-pet')).toHaveLength(1)
    setSessionToken('unverified-B')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.saved-pet')).toHaveLength(0)
    expect(wrapper.find('.saved-stray').exists()).toBe(false)
    wrapper.unmount()
  })

  it('current namespace storage updates replace retrieval, rejecting obsolete completions and wrong-ID responses', async () => {
    store.toggleSave('old-id'); const old = deferred<Pet>(); api.getPet.mockReturnValueOnce(old.promise).mockResolvedValue(pet('wrong-id'))
    const wrapper = await render(); await flushPromises()
    localStorage.setItem('pawradar_saved_pets:v2:guest', '["new-id"]')
    window.dispatchEvent(new StorageEvent('storage', { key: 'pawradar_saved_pets:v2:guest', newValue: '["obsolete-event"]' }))
    old.resolve(pet('old-id')); await flushPromises()
    expect(wrapper.findAll('.saved-pet')).toHaveLength(0)
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(store.savedPetIds.value).toEqual(['new-id'])
    api.getPet.mockResolvedValue(pet('new-id'))
    await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('new-id')
    wrapper.unmount()
  })

  it('unreadable local storage shows persistence feedback, not a false empty state', async () => {
    localStorage.setItem('pawradar_saved_pets:v2:guest', '{bad json'); invalidateAuthContext()
    const wrapper = await render(); await flushPromises()
    expect(wrapper.text()).toContain(i18n.global.t('savedRepair.storageIssue'))
    expect(wrapper.find('.empty-state').exists()).toBe(false)
    wrapper.unmount()
  })

  it('revisiting and rehydrating the verified account restores IDs without persisting private pet data', async () => {
    login('owner'); store.toggleSave('private-pet')
    api.getPet.mockResolvedValue(pet('private-pet'))
    const first = await render('owner'); await flushPromises(); first.unmount()
    invalidateAuthContext({ external: true }) // Models loss of verified in-memory identity on a new visit.
    expect(store.savedPetIds.value).toEqual([])
    expect(activateSavedPetsAccount('owner', captureAuthContext())).toBe(true)
    const second = await render('owner'); await flushPromises()
    expect(second.findAll('.saved-pet')).toHaveLength(1)
    expect(localStorage.getItem('pawradar_saved_pets:v2:user:owner')).toBe('["private-pet"]')
    expect(localStorage.getItem('pawradar_saved_pets:v2:user:owner')).not.toContain('PRIVATE_PHONE')
    second.unmount()
  })
})
