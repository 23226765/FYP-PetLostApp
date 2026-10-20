import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SavedRescuePostsTab from '../profile/SavedRescuePostsTab.vue'
import { captureAuthContext, invalidateAuthContext, setSessionToken } from '../../services/authSession'
import { activateSavedPetsAccount } from '../../composables/useSavedPets'
import { i18n } from '../../i18n'

const api = vi.hoisted(() => ({ getSavedStraysPage: vi.fn(), setStraySaved: vi.fn() }))
vi.mock('../../services/api', () => api)
const page = (number: number, ids: string[], total = ids.length, hasMore = false, unavailableCount = 0) => ({ strays: ids.map(id => ({ id })), pagination: { page: number, limit: 20, total, hasMore }, unavailableCount })
const render = (active = true) => mount(SavedRescuePostsTab, { props: { userId: 'A', active, refreshKey: 0 }, global: { plugins: [i18n], stubs: { AppIcon: true, ProfileStrayCard: { props: ['stray'], emits: ['unsave'], template: '<article class="saved-row">{{ stray.id }}<button class="unsave" @click="$emit(\'unsave\', stray.id)">Unsave</button></article>' } } } })
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes }); return { promise, resolve } }

describe('profile saved rescue paging and session guards', () => {
  beforeEach(() => { localStorage.clear(); setSessionToken('fixture-A'); vi.resetAllMocks(); i18n.global.locale.value = 'en' })

  it('shows unavailable counts and load-more even when a page contains no visible posts', async () => {
    api.getSavedStraysPage.mockResolvedValueOnce(page(1, [], 21, true, 20)).mockResolvedValueOnce(page(2, ['visible'], 21))
    const wrapper = render(); await flushPromises()
    expect(wrapper.get('.unavailable').text()).toContain('20')
    expect(wrapper.find('.load-more').exists()).toBe(true)
    await wrapper.get('.load-more').trigger('click'); await flushPromises()
    expect(api.getSavedStraysPage.mock.calls.at(-1)?.[0].page).toBe(2)
    expect(wrapper.findAll('.saved-row')).toHaveLength(1)
    expect(wrapper.get('.unavailable').text()).toContain('20')
    wrapper.unmount()
  })

  it('invalidates an old load when changing accounts while the tab is inactive', async () => {
    const old = deferred<ReturnType<typeof page>>()
    api.getSavedStraysPage.mockReturnValueOnce(old.promise).mockResolvedValueOnce(page(1, ['B-post']))
    const wrapper = render(); await flushPromises()
    await wrapper.setProps({ active: false }); setSessionToken('fixture-B')
    await wrapper.setProps({ userId: 'B' })
    old.resolve(page(1, ['A-private-post'])); await flushPromises()
    expect(wrapper.text()).not.toContain('A-private-post')
    await wrapper.setProps({ active: true }); await flushPromises()
    expect(wrapper.text()).toContain('B-post')
    wrapper.unmount()
  })

  it('old unsave completion cannot remove a new account row or refresh its list', async () => {
    const removal = deferred<boolean>()
    api.getSavedStraysPage.mockResolvedValue(page(1, ['shared-public-post']))
    api.setStraySaved.mockReturnValueOnce(removal.promise)
    const wrapper = render(); await flushPromises()
    await wrapper.get('.unsave').trigger('click')
    setSessionToken('fixture-B'); await wrapper.setProps({ userId: 'B' }); await flushPromises()
    const reads = api.getSavedStraysPage.mock.calls.length
    removal.resolve(false); await flushPromises()
    expect(wrapper.findAll('.saved-row')).toHaveLength(1)
    expect(api.getSavedStraysPage).toHaveBeenCalledTimes(reads)
    wrapper.unmount()
  })

  it('failed refresh after offset-shifting unsave must retry page one before loading later pages', async () => {
    api.getSavedStraysPage.mockResolvedValueOnce(page(1, ['removed', 'remaining'], 40, true))
      .mockRejectedValueOnce(new Error('refresh outage'))
      .mockResolvedValueOnce(page(1, ['remaining', 'shifted-from-next-page'], 39, true))
      .mockResolvedValueOnce(page(2, ['later'], 39))
    api.setStraySaved.mockResolvedValue(false)
    const wrapper = render(); await flushPromises()
    await wrapper.get('.unsave').trigger('click'); await flushPromises()
    expect(wrapper.findAll('.saved-row')).toHaveLength(1)
    expect(wrapper.find('[role="alert"] button').exists()).toBe(true)
    await wrapper.get('.load-more').trigger('click'); await flushPromises()
    expect(api.getSavedStraysPage.mock.calls.at(-1)?.[0].page).toBe(1)
    expect(wrapper.text()).toContain('shifted-from-next-page')
    await wrapper.get('.load-more').trigger('click'); await flushPromises()
    expect(api.getSavedStraysPage.mock.calls.at(-1)?.[0].page).toBe(2)
    wrapper.unmount()
  })

  it('retains inline retry for a failed refresh when there are cards but no later page', async () => {
    api.getSavedStraysPage.mockResolvedValueOnce(page(1, ['removed', 'remaining'], 2))
      .mockRejectedValueOnce(new Error('refresh outage')).mockResolvedValueOnce(page(1, ['remaining'], 1))
    api.setStraySaved.mockResolvedValue(false)
    const wrapper = render(); await flushPromises()
    await wrapper.get('.unsave').trigger('click'); await flushPromises()
    await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.findAll('.saved-row')).toHaveLength(1)
    wrapper.unmount()
  })

  it('unmount prevents a late unsave completion from starting another request', async () => {
    const removal = deferred<boolean>()
    api.getSavedStraysPage.mockResolvedValue(page(1, ['one']))
    api.setStraySaved.mockReturnValue(removal.promise)
    const wrapper = render(); await flushPromises()
    await wrapper.get('.unsave').trigger('click'); wrapper.unmount()
    removal.resolve(false); await flushPromises()
    expect(api.getSavedStraysPage).toHaveBeenCalledTimes(1)
  })

  it('same-token cancellation refreshes the verified account instead of displaying a false empty tab', async () => {
    activateSavedPetsAccount('A', captureAuthContext())
    api.getSavedStraysPage.mockResolvedValue(page(1, ['same-account-post']))
    const wrapper = render(); await flushPromises()
    invalidateAuthContext(); await flushPromises()
    expect(api.getSavedStraysPage).toHaveBeenCalledTimes(2)
    expect(wrapper.findAll('.saved-row')).toHaveLength(1)
    wrapper.unmount()
  })
})
