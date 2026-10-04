import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import BlockedUsersScreen from '../BlockedUsersScreen.vue'

const apiMocks = vi.hoisted(() => ({ getBlockedUsers: vi.fn(), unblockUser: vi.fn() }))
vi.mock('../../services/api', () => apiMocks)

async function render(user: { id: string; name: string; email: string } | null) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/settings/blocked', component: { template: '<div />' } },
  ] })
  await router.push('/settings/blocked'); await router.isReady()
  const wrapper = mount(BlockedUsersScreen, { props: { user }, global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('BlockedUsersScreen', () => {
  beforeEach(() => { apiMocks.getBlockedUsers.mockReset(); apiMocks.unblockUser.mockReset() })

  it('shows an auth prompt without fetching private block state for guests', async () => {
    const wrapper = await render(null)
    expect(wrapper.text()).toContain('Sign in to manage blocked accounts')
    expect(apiMocks.getBlockedUsers).not.toHaveBeenCalled()
    await wrapper.get('.state-card button').trigger('click')
    expect(wrapper.emitted('auth-needed')).toHaveLength(1)
  })

  it('loads account-scoped blocks and removes only the selected account after unblocking', async () => {
    apiMocks.getBlockedUsers.mockResolvedValue([
      { id: 'blocked-one', name: 'Blocked One', avatar: '', blockedAt: '2026-09-26T10:00:00Z' },
      { id: 'blocked-two', name: 'Blocked Two', avatar: '', blockedAt: '2026-09-26T11:00:00Z' },
    ])
    apiMocks.unblockUser.mockResolvedValue(undefined)
    const wrapper = await render({ id: 'viewer', name: 'Viewer', email: 'viewer@example.test' })
    expect(wrapper.findAll('.blocked-list li')).toHaveLength(2)
    await wrapper.findAll('.blocked-list button')[0].trigger('click')
    await flushPromises()
    expect(apiMocks.unblockUser).toHaveBeenCalledWith('blocked-one')
    expect(wrapper.findAll('.blocked-list li')).toHaveLength(1)
    expect(wrapper.text()).toContain('Blocked Two')
  })

  it('replaces stale block state when the authenticated account changes', async () => {
    apiMocks.getBlockedUsers
      .mockResolvedValueOnce([{ id: 'first-block', name: 'First Block', avatar: '', blockedAt: '2026-09-26T10:00:00Z' }])
      .mockResolvedValueOnce([{ id: 'second-block', name: 'Second Block', avatar: '', blockedAt: '2026-09-26T11:00:00Z' }])
    const wrapper = await render({ id: 'first-user', name: 'First', email: 'first@example.test' })
    expect(wrapper.text()).toContain('First Block')
    await wrapper.setProps({ user: { id: 'second-user', name: 'Second', email: 'second@example.test' } })
    await flushPromises()
    expect(wrapper.text()).not.toContain('First Block')
    expect(wrapper.text()).toContain('Second Block')
  })
})
