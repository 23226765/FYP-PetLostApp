import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { StrayReport } from '../../types/stray'
import StrayDetailScreen from '../StrayDetailScreen.vue'
import { applyAccountPreferences } from '../../composables/usePreferences'
import { useAppI18n } from '../../i18n'

const apiMocks = vi.hoisted(() => ({
  addStrayComment: vi.fn(), deleteStray: vi.fn(), getChatInbox: vi.fn(),
  getStrayById: vi.fn(), getStrayComments: vi.fn(), removeStrayComment: vi.fn(),
  sendMessage: vi.fn(), setStraySaved: vi.fn(), updateStray: vi.fn(), updateStrayStatus: vi.fn(),
}))
vi.mock('../../services/api', () => apiMocks)

const post: StrayReport = {
  id: 'stray-one', species: 'Dog', animalType: '', description: 'Friendly dog waiting by a bench',
  photo: '', photos: [], condition: 'healthy', district: 'Sha Tin', location: 'River promenade',
  coordinates: [114.19, 22.38], rescueStatus: 'reported', reporterName: 'Owner',
  locationPrecision: 'exact',
  author: { id: 'owner-id', name: 'Owner', avatar: '' }, canViewContact: false, reportedBy: 'owner-id',
  reportedAgo: '5m ago', observedAt: '2026-09-18T08:00:00.000Z', createdAt: '2026-09-18T08:00:00.000Z',
  updatedAt: '2026-09-18T08:00:00.000Z', statusUpdatedAt: '2026-09-18T08:00:00.000Z',
  commentCount: 0, isSaved: false, canManage: true, canEdit: true, canDelete: true, canUpdateStatus: true,
}

async function render(query = '') {
  apiMocks.getStrayById.mockResolvedValue({ ...post })
  apiMocks.getStrayComments.mockResolvedValue({ comments: [], pagination: { page: 1, limit: 50, total: 0, hasMore: false } })
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/strays/:id', component: { template: '<div />' } }, { path: '/', component: { template: '<div />' } },
  ] })
  await router.push('/strays/stray-one' + query); await router.isReady()
  const wrapper = mount(StrayDetailScreen, {
    props: { user: { id: 'owner-id', name: 'Owner', email: 'owner@example.test' } },
    global: { plugins: [router], stubs: { AppIcon: { template: '<span />' }, MapView: { template: '<div class="map-stub" />' } } },
  })
  await flushPromises()
  return wrapper
}

async function renderAsFinder(overrides: Partial<StrayReport> = {}, page = { comments: [] as Array<{ id: string; strayId: string; text: string; author: { id: string; name: string; avatar: string }; createdAt: string; updatedAt: string }>, pagination: { page: 1, limit: 50, total: 0, hasMore: false } }) {
  apiMocks.getStrayById.mockResolvedValue({ ...post, canManage: false, canEdit: false, canDelete: false, canUpdateStatus: false, interactionBlocked: true, ...overrides })
  apiMocks.getStrayComments.mockResolvedValue(page)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/strays/:id', component: { template: '<div />' } }, { path: '/', component: { template: '<div />' } },
  ] })
  await router.push('/strays/stray-one'); await router.isReady()
  const wrapper = mount(StrayDetailScreen, {
    props: { user: { id: 'finder-id', name: 'Finder', email: 'finder@example.test' } },
    global: { plugins: [router], stubs: { AppIcon: { template: '<span />' }, MapView: { template: '<div />' }, SafetyActions: { name: 'SafetyActions', emits: ['blocked', 'auth-needed'], template: '<div class="safety-stub" />' } } },
  })
  await flushPromises()
  return wrapper
}

describe('StrayDetailScreen community actions', () => {
  beforeEach(() => { Object.values(apiMocks).forEach((mock) => mock.mockReset()); applyAccountPreferences({ language: 'en', theme: 'light' }) })

  it('opens the existing authorized in-app share sheet from the feed action', async () => {
    apiMocks.getChatInbox.mockResolvedValue([])
    const wrapper = await render('?share=1')
    expect(apiMocks.getChatInbox).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.share-sheet').exists()).toBe(true)
    expect(apiMocks.sendMessage).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shelter staff get status controls, never another author’s edit/image/delete controls', async () => {
    const wrapper = await renderAsFinder({ canUpdateStatus: true, interactionBlocked: false })
    await wrapper.setProps({ user: { id: 'shelter-id', name: 'Shelter', email: 'shelter@example.test', role: 'shelter_admin' } }); await flushPromises()
    expect(wrapper.findAll('.status-buttons button')).toHaveLength(3)
    expect(wrapper.find('.manage-card textarea').exists()).toBe(false)
    expect(wrapper.find('.save-edit').exists()).toBe(false)
    expect(wrapper.find('.manage-actions .danger').exists()).toBe(false)
    expect(wrapper.find('.image-editor').exists()).toBe(false)
    expect(apiMocks.updateStray).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('edit, status and deletion failures have independent errors and keep the draft for retry', async () => {
    const wrapper = await render()
    await wrapper.get('.manage-card textarea').setValue('Keep my edited caption')
    let failEdit!: (cause: Error) => void
    apiMocks.updateStray.mockImplementationOnce(() => new Promise((_resolve, reject) => { failEdit = reject }))
    await wrapper.get('.save-edit').trigger('click')
    await wrapper.get('.save-edit').trigger('click')
    expect(apiMocks.updateStray).toHaveBeenCalledTimes(1)
    expect(wrapper.get('.manage-actions .danger').attributes('disabled')).toBeDefined()
    failEdit(new Error('offline')); await flushPromises()
    expect(wrapper.text()).toContain('Unable to save your changes')
    expect((wrapper.get('.manage-card textarea').element as HTMLTextAreaElement).value).toBe('Keep my edited caption')
    apiMocks.updateStrayStatus.mockRejectedValueOnce(new Error('offline'))
    await wrapper.findAll('.status-buttons button')[1].trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('Unable to update the rescue status')
    expect(wrapper.get('.status-buttons .active').text()).toBe('Spotted')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    apiMocks.deleteStray.mockRejectedValueOnce(new Error('offline'))
    await wrapper.get('.manage-actions .danger').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('Unable to remove this post')
    expect(wrapper.vm.$route.path).toBe('/strays/stray-one')
    apiMocks.updateStray.mockResolvedValueOnce({ ...post, description: 'Keep my edited caption' })
    await wrapper.get('.save-edit').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('Changes saved.')
    expect(wrapper.text()).not.toContain('Unable to save your changes')
    wrapper.unmount(); vi.restoreAllMocks()
  })

  it('locks status/deletion requests and cancellation does not send a deletion', async () => {
    const wrapper = await render()
    let finish!: (value: StrayReport) => void
    apiMocks.updateStrayStatus.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await wrapper.findAll('.status-buttons button')[1].trigger('click')
    await wrapper.findAll('.status-buttons button')[1].trigger('click')
    expect(apiMocks.updateStrayStatus).toHaveBeenCalledTimes(1)
    finish({ ...post, rescueStatus: 'rescue_dispatched' }); await flushPromises()
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true)
    await wrapper.get('.manage-actions .danger').trigger('click')
    expect(apiMocks.deleteStray).not.toHaveBeenCalled()
    let remove!: () => void
    apiMocks.deleteStray.mockImplementationOnce(() => new Promise<void>(resolve => { remove = resolve }))
    await wrapper.get('.manage-actions .danger').trigger('click')
    await wrapper.get('.manage-actions .danger').trigger('click')
    expect(apiMocks.deleteStray).toHaveBeenCalledTimes(1)
    remove(); await flushPromises(); expect(wrapper.vm.$route.path).toBe('/')
    wrapper.unmount(); vi.restoreAllMocks()
  })

  it('retries the same comment identity after a lost response, but binds new text to a new ID', async () => {
    const wrapper = await render()
    apiMocks.addStrayComment.mockRejectedValue(new Error('response lost'))
    await wrapper.get('.comment-form input').setValue('Same request')
    await wrapper.get('.comment-form').trigger('submit'); await flushPromises()
    await wrapper.get('.comment-form').trigger('submit'); await flushPromises()
    expect(apiMocks.addStrayComment.mock.calls[0]).toEqual(apiMocks.addStrayComment.mock.calls[1])
    expect((wrapper.get('.comment-form input').element as HTMLInputElement).value).toBe('Same request')
    await wrapper.get('.comment-form input').setValue('Different request')
    await wrapper.get('.comment-form').trigger('submit'); await flushPromises()
    expect(apiMocks.addStrayComment.mock.calls[2][2]).not.toBe(apiMocks.addStrayComment.mock.calls[1][2])
    wrapper.unmount()
  })

  it('uses server totals after mutations and deduplicates paginated history by ID', async () => {
    const wrapper = await render()
    const row = { id: 'comment-one', strayId: post.id, text: 'I can help', author: { id: 'owner-id', name: 'Owner', avatar: '' }, createdAt: post.createdAt, updatedAt: post.updatedAt }
    apiMocks.getStrayComments.mockResolvedValue({ comments: [row], pagination: { page: 1, limit: 50, total: 123, hasMore: true } })
    apiMocks.addStrayComment.mockResolvedValue(row)
    await wrapper.get('.comment-form input').setValue(row.text)
    await wrapper.get('.comment-form').trigger('submit'); await flushPromises()
    expect(wrapper.get('.comments h2 span').text()).toBe('123')
    expect(wrapper.findAll('.comment')).toHaveLength(1)
    apiMocks.getStrayComments.mockResolvedValueOnce({ comments: [row, { ...row, id: 'comment-two' }], pagination: { page: 2, limit: 50, total: 123, hasMore: true } })
    await wrapper.get('.load-comments').trigger('click'); await flushPromises()
    expect(apiMocks.getStrayComments).toHaveBeenLastCalledWith(post.id, 2)
    expect(wrapper.findAll('.comment')).toHaveLength(2)
    expect(wrapper.get('.comments h2 span').text()).toBe('123')
    apiMocks.removeStrayComment.mockResolvedValue(undefined)
    apiMocks.getStrayComments.mockResolvedValueOnce({ comments: [{ ...row, id: 'comment-two' }], pagination: { page: 1, limit: 50, total: 122, hasMore: true } })
    await wrapper.findAll('.comment > button')[0].trigger('click'); await flushPromises()
    expect(wrapper.get('.comments h2 span').text()).toBe('122')
    wrapper.unmount()
  })

  it('an old account failure cannot restore errors or drafts in the next account', async () => {
    const wrapper = await render()
    let fail!: (cause: Error) => void
    apiMocks.updateStray.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
    await wrapper.get('.save-edit').trigger('click')
    apiMocks.getStrayById.mockResolvedValue({ ...post, canEdit: false, canDelete: false, canUpdateStatus: false })
    await wrapper.setProps({ user: { id: 'new-account', name: 'New', email: 'new@example.test' } }); await flushPromises()
    fail(new Error('old failure')); await flushPromises()
    expect(wrapper.find('.manage-card').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Unable to save')
    wrapper.unmount()
  })

  it('an older load-more response cannot restore blocked comments or stale pagination', async () => {
    const row = { id: 'old-comment', strayId: post.id, text: 'Old comment', author: { id: 'owner-id', name: 'Owner', avatar: '' }, createdAt: post.createdAt, updatedAt: post.updatedAt }
    const wrapper = await renderAsFinder({ interactionBlocked: false }, { comments: [row], pagination: { page: 1, limit: 50, total: 60, hasMore: true } })
    let finish!: (page: unknown) => void
    apiMocks.getStrayComments.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await wrapper.get('.load-comments').trigger('click')
    apiMocks.getStrayComments.mockResolvedValueOnce({ comments: [], pagination: { page: 1, limit: 50, total: 0, hasMore: false } })
    wrapper.findComponent({ name: 'SafetyActions' }).vm.$emit('blocked'); await flushPromises()
    expect(wrapper.findAll('.comment')).toHaveLength(0)
    finish({ comments: [row], pagination: { page: 2, limit: 50, total: 60, hasMore: true } }); await flushPromises()
    expect(wrapper.findAll('.comment')).toHaveLength(0)
    expect(wrapper.get('.comments h2 span').text()).toBe('0')
    expect(wrapper.find('.load-comments').exists()).toBe(false)
    wrapper.unmount()
  })

  it('a delayed status response cannot overwrite a newer server comment total', async () => {
    const wrapper = await render()
    let finish!: (value: StrayReport) => void
    apiMocks.updateStrayStatus.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await wrapper.findAll('.status-buttons button')[1].trigger('click')
    const row = { id: 'new-comment', strayId: post.id, text: 'Fresh comment', author: { id: 'owner-id', name: 'Owner', avatar: '' }, createdAt: post.createdAt, updatedAt: post.updatedAt }
    apiMocks.addStrayComment.mockResolvedValueOnce(row)
    apiMocks.getStrayComments.mockResolvedValueOnce({ comments: [row], pagination: { page: 1, limit: 50, total: 123, hasMore: true } })
    await wrapper.get('.comment-form input').setValue(row.text)
    await wrapper.get('.comment-form').trigger('submit'); await flushPromises()
    finish({ ...post, rescueStatus: 'rescue_dispatched', commentCount: 0 }); await flushPromises()
    expect(wrapper.get('.comments h2 span').text()).toBe('123')
    expect(wrapper.findAll('.comment')).toHaveLength(1)
    expect(wrapper.get('.status-buttons .active').text()).toBe('Help dispatched')
    wrapper.unmount()
  })

  it('a deletion refresh wins over older pagination and its stale failure', async () => {
    const wrapper = await render()
    const row = { id: 'remove-comment', strayId: post.id, text: 'Remove me', author: { id: 'owner-id', name: 'Owner', avatar: '' }, createdAt: post.createdAt, updatedAt: post.updatedAt }
    apiMocks.addStrayComment.mockResolvedValue(row)
    apiMocks.getStrayComments.mockResolvedValueOnce({ comments: [row], pagination: { page: 1, limit: 50, total: 60, hasMore: true } })
    await wrapper.get('.comment-form input').setValue(row.text)
    await wrapper.get('.comment-form').trigger('submit'); await flushPromises()
    let fail!: (cause: Error) => void
    apiMocks.getStrayComments.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject }))
    await wrapper.get('.load-comments').trigger('click')
    apiMocks.removeStrayComment.mockResolvedValue(undefined)
    apiMocks.getStrayComments.mockResolvedValueOnce({ comments: [], pagination: { page: 1, limit: 50, total: 59, hasMore: true } })
    await wrapper.get('.comment > button').trigger('click'); await flushPromises()
    fail(new Error('obsolete page failed')); await flushPromises()
    expect(wrapper.findAll('.comment')).toHaveLength(0)
    expect(wrapper.get('.comments h2 span').text()).toBe('59')
    expect(wrapper.text()).not.toContain('Comments could not be loaded')
    expect(wrapper.get('.load-comments').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('renders localized operation feedback in all supported locales and both themes', async () => {
    for (const language of ['en', 'zh-HK', 'zh-CN'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        applyAccountPreferences({ language, theme })
        const wrapper = await render()
        apiMocks.updateStray.mockRejectedValueOnce(new Error('offline'))
        await wrapper.get('.save-edit').trigger('click'); await flushPromises()
        expect(wrapper.text()).toContain(useAppI18n().t('rescueRepair.editFailed'))
        expect(wrapper.text()).not.toContain('rescueRepair.')
        expect(wrapper.text()).toContain(post.description)
        expect(document.documentElement.dataset.theme).toBe(theme)
        wrapper.unmount()
      }
    }
  })

  it('adds one comment, updates state, and deletes only by stable comment id', async () => {
    apiMocks.addStrayComment.mockResolvedValue({ id: 'comment-one', strayId: 'stray-one', text: 'I can help.', author: { id: 'owner-id', name: 'Owner', avatar: '' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    apiMocks.removeStrayComment.mockResolvedValue(undefined)
    const wrapper = await render()
    await wrapper.get('.comment-form input').setValue('I can help.')
    await wrapper.get('.comment-form').trigger('submit'); await flushPromises()
    expect(wrapper.findAll('.comment')).toHaveLength(1)
    await wrapper.get('.comment > button').trigger('click'); await flushPromises()
    expect(apiMocks.removeStrayComment).toHaveBeenCalledWith('stray-one', 'comment-one')
    expect(wrapper.findAll('.comment')).toHaveLength(0)
  })

  it('shares the structured stray reference to the selected existing conversation', async () => {
    apiMocks.getChatInbox.mockResolvedValue([{ id: 'pet-one:finder', pet: { id: 'pet-one', name: 'Maple', photo: '', owner: 'Owner', canViewContact: false, participantId: 'finder-id', participantName: 'Finder' }, lastMessage: { id: 'm1', petId: 'pet-one', sender: 'owner', text: 'Hello', createdAt: new Date().toISOString() }, updatedAt: new Date().toISOString() }])
    apiMocks.sendMessage.mockResolvedValue({ id: 'shared-message', petId: 'pet-one', sender: 'owner', text: 'Shared', createdAt: new Date().toISOString() })
    const wrapper = await render()
    await wrapper.findAll('.post-actions button')[2].trigger('click'); await flushPromises()
    await wrapper.get('.conversation').trigger('click'); await flushPromises()
    expect(apiMocks.sendMessage).toHaveBeenCalledWith('pet-one', expect.objectContaining({ participantId: 'finder-id', sharedStrayId: 'stray-one' }))
  })

  it('keeps the rescue post visible while disabling comments for a blocked relationship', async () => {
    const wrapper = await renderAsFinder()
    expect(wrapper.text()).toContain('Friendly dog waiting by a bench')
    expect(wrapper.find('.comment-form').exists()).toBe(false)
    expect(wrapper.text()).toContain('cannot message or comment')
  })
})
