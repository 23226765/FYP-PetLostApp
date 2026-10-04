import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { StrayReport } from '../../types/stray'
import StrayDetailScreen from '../StrayDetailScreen.vue'

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
  commentCount: 0, isSaved: false, canManage: true,
}

async function render() {
  apiMocks.getStrayById.mockResolvedValue({ ...post })
  apiMocks.getStrayComments.mockResolvedValue([])
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/strays/:id', component: { template: '<div />' } }, { path: '/', component: { template: '<div />' } },
  ] })
  await router.push('/strays/stray-one'); await router.isReady()
  const wrapper = mount(StrayDetailScreen, {
    props: { user: { id: 'owner-id', name: 'Owner', email: 'owner@example.test' } },
    global: { plugins: [router], stubs: { AppIcon: { template: '<span />' }, MapView: { template: '<div class="map-stub" />' } } },
  })
  await flushPromises()
  return wrapper
}

async function renderAsFinder(overrides: Partial<StrayReport> = {}) {
  apiMocks.getStrayById.mockResolvedValue({ ...post, canManage: false, interactionBlocked: true, ...overrides })
  apiMocks.getStrayComments.mockResolvedValue([])
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/strays/:id', component: { template: '<div />' } }, { path: '/', component: { template: '<div />' } },
  ] })
  await router.push('/strays/stray-one'); await router.isReady()
  const wrapper = mount(StrayDetailScreen, {
    props: { user: { id: 'finder-id', name: 'Finder', email: 'finder@example.test' } },
    global: { plugins: [router], stubs: { AppIcon: { template: '<span />' }, MapView: { template: '<div />' }, SafetyActions: { template: '<div class="safety-stub" />' } } },
  })
  await flushPromises()
  return wrapper
}

describe('StrayDetailScreen community actions', () => {
  beforeEach(() => Object.values(apiMocks).forEach((mock) => mock.mockReset()))

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
