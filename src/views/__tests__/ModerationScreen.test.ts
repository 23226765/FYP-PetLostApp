import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { applyAccountPreferences } from '../../composables/usePreferences'
import type { ModerationReport } from '../../types/safety'
import type { User } from '../../types/user'
import ModerationScreen from '../ModerationScreen.vue'

const apiMocks = vi.hoisted(() => ({
  getModerationReports: vi.fn(),
  updateContentVisibility: vi.fn(),
  updateModerationReport: vi.fn(),
  readManagedImage: vi.fn(),
}))
vi.mock('../../services/api', () => apiMocks)

const admin: User = { id: 'admin-id', name: 'Shelter Admin', email: 'admin@example.test', role: 'shelter_admin' }
const ordinary: User = { id: 'user-id', name: 'Ordinary User', email: 'user@example.test', role: 'user' }
const report: ModerationReport = {
  id: 'report-id', targetType: 'pet', targetId: 'pet-id', reason: 'spam',
  details: 'Repeated misleading listing.', status: 'pending',
  createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z',
  reporter: { id: 'reporter-id', name: 'Reporter', avatar: '', role: 'user' },
  targetOwner: { id: 'owner-id', name: 'Owner', avatar: '', role: 'user' },
  target: { id: 'pet-id', type: 'pet', available: true, title: 'Maple', subtitle: 'Dog · Sha Tin', excerpt: '', photo: '' },
  review: { note: '', reviewedAt: null, reviewedBy: null },
}

async function render(user: User | null) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/moderation', component: { template: '<div />' } },
  ] })
  await router.push('/moderation')
  await router.isReady()
  const wrapper = mount(ModerationScreen, { props: { user }, global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('ModerationScreen', () => {
  it('renders authenticated evidence in all locales/themes without translating user content', async () => {
    const id = 'a'.repeat(24)
    apiMocks.getModerationReports.mockResolvedValue({
      reports: [{ ...report, id, target: { ...report.target, evidenceImages: [0, 1].map((index) => `/api/moderation/reports/${id}/images/${index}`) } }],
      pagination: { page: 1, limit: 20, total: 1 },
    })
    for (const language of ['en', 'zh-HK', 'zh-CN'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        applyAccountPreferences({ language, theme })
        const wrapper = await render(admin)
        expect(wrapper.findAll('.evidence-gallery img')).toHaveLength(2)
        expect(wrapper.get('.evidence-gallery img').attributes('src')).toBe('blob:moderation-evidence')
        expect(wrapper.get('.evidence-gallery img').attributes('alt')).not.toContain('moderationEvidence.')
        expect(wrapper.text()).toContain('Repeated misleading listing.')
        expect(document.documentElement.dataset.theme).toBe(theme)
        await wrapper.setProps({ user: ordinary }); await flushPromises()
        expect(wrapper.find('.evidence-gallery').exists()).toBe(false)
        expect(URL.revokeObjectURL).toHaveBeenCalled()
        wrapper.unmount()
      }
    }
  })
  it('does not let an obsolete administrator request block the next administrator queue', async () => {
    let finish!: (value: unknown) => void
    apiMocks.getModerationReports.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const wrapper = await render(admin)
    await wrapper.setProps({ user: ordinary })
    await wrapper.setProps({ user: { ...admin, id: 'other-admin' } }); await flushPromises()
    expect(apiMocks.getModerationReports).toHaveBeenCalledTimes(2)
    expect(wrapper.findAll('.report-card')).toHaveLength(1)
    finish({ reports: [], pagination: { page: 1, limit: 20, total: 0 } }); await flushPromises()
    expect(wrapper.findAll('.report-card')).toHaveLength(1)
    wrapper.unmount()
  })
  beforeEach(() => {
    apiMocks.getModerationReports.mockReset()
    apiMocks.updateContentVisibility.mockReset()
    apiMocks.updateModerationReport.mockReset()
    apiMocks.readManagedImage.mockReset().mockResolvedValue(new Blob(['safe'], { type: 'image/webp' }))
    URL.createObjectURL = vi.fn(() => 'blob:moderation-evidence')
    URL.revokeObjectURL = vi.fn()
    applyAccountPreferences({ language: 'en', theme: 'light' })
    apiMocks.getModerationReports.mockResolvedValue({
      reports: [report], pagination: { page: 1, limit: 20, total: 1 },
    })
  })

  it('does not request the private queue for guests or ordinary users', async () => {
    const guest = await render(null)
    expect(guest.text()).toContain('Sign in to access safety review')
    await guest.get('.primary-button').trigger('click')
    expect(guest.emitted('auth-needed')).toHaveLength(1)

    const denied = await render(ordinary)
    expect(denied.text()).toContain('Administrator access required')
    expect(apiMocks.getModerationReports).not.toHaveBeenCalled()
  })

  it('loads a shelter administrator queue and renders user content unchanged', async () => {
    const wrapper = await render(admin)
    expect(apiMocks.getModerationReports).toHaveBeenCalledWith({ status: 'pending', page: 1, limit: 20 })
    expect(wrapper.findAll('.report-card')).toHaveLength(1)
    expect(wrapper.text()).toContain('Maple')
    expect(wrapper.text()).toContain('Repeated misleading listing.')
    expect(wrapper.text()).toContain('Reporter')
  })

  it('records a decision once and removes it from the pending queue', async () => {
    apiMocks.updateModerationReport.mockResolvedValue({
      ...report,
      status: 'reviewed',
      review: { note: 'Evidence checked.', reviewedAt: '2026-10-02T10:00:00Z', reviewedBy: { id: admin.id, name: admin.name, avatar: '', role: 'shelter_admin' } },
    })
    const wrapper = await render(admin)
    await wrapper.get('.note-field textarea').setValue('Evidence checked.')
    await wrapper.findAll('.review-actions button')[0].trigger('click')
    await flushPromises()

    expect(apiMocks.updateModerationReport).toHaveBeenCalledTimes(1)
    expect(apiMocks.updateModerationReport).toHaveBeenCalledWith('report-id', {
      status: 'reviewed', note: 'Evidence checked.',
    })
    expect(wrapper.findAll('.report-card')).toHaveLength(0)
  })

  it('keeps the report and shows a localized error when a decision fails', async () => {
    apiMocks.updateModerationReport.mockRejectedValue(new Error('network failed'))
    const wrapper = await render(admin)
    await wrapper.findAll('.review-actions button')[1].trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.report-card')).toHaveLength(1)
    expect(wrapper.get('.inline-error').text()).toBe('Unable to save this moderation decision.')
  })

  it('requires a reason and keeps visibility actions independent from report decisions', async () => {
    const visibilityReport: ModerationReport = {
      ...report,
      target: {
        ...report.target,
        moderatable: true,
        moderation: { status: 'visible', reason: '', moderatedAt: null, moderatedBy: null },
      },
    }
    apiMocks.getModerationReports.mockResolvedValue({
      reports: [visibilityReport], pagination: { page: 1, limit: 20, total: 1 },
    })
    apiMocks.updateContentVisibility.mockResolvedValue({
      id: 'pet-id', type: 'pet',
      moderation: {
        status: 'hidden', reason: 'Unsafe instructions',
        moderatedAt: '2026-10-02T10:00:00Z',
        moderatedBy: { id: admin.id, name: admin.name, avatar: '', role: 'shelter_admin' },
      },
    })
    const wrapper = await render(admin)
    await wrapper.get('.hide-content').trigger('click')
    expect(apiMocks.updateContentVisibility).not.toHaveBeenCalled()
    expect(wrapper.get('.inline-error').text()).toBe(
      'Enter an internal reason before hiding this content.',
    )

    await wrapper.get('.visibility-field textarea').setValue('Unsafe instructions')
    await wrapper.get('.hide-content').trigger('click')
    await flushPromises()
    expect(apiMocks.updateContentVisibility).toHaveBeenCalledWith('pet', 'pet-id', {
      moderationStatus: 'hidden', reason: 'Unsafe instructions',
    })
    expect(wrapper.find('.restore-content').exists()).toBe(true)
    expect(apiMocks.updateModerationReport).not.toHaveBeenCalled()

    apiMocks.updateContentVisibility.mockResolvedValue({
      id: 'pet-id', type: 'pet',
      moderation: {
        status: 'visible', reason: 'Appeal approved',
        moderatedAt: '2026-10-03T10:00:00Z',
        moderatedBy: { id: admin.id, name: admin.name, avatar: '', role: 'shelter_admin' },
      },
    })
    await wrapper.get('.visibility-field textarea').setValue('Appeal approved')
    await wrapper.get('.restore-content').trigger('click')
    await flushPromises()
    expect(apiMocks.updateContentVisibility).toHaveBeenLastCalledWith('pet', 'pet-id', {
      moderationStatus: 'visible', reason: 'Appeal approved',
    })
    expect(wrapper.find('.hide-content').exists()).toBe(true)
  })

  it('clears stale queue data on logout or account switch', async () => {
    let resolveRequest!: (value: unknown) => void
    apiMocks.getModerationReports.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve }))
    const wrapper = await render(admin)
    await wrapper.setProps({ user: ordinary })
    resolveRequest({ reports: [report], pagination: { page: 1, limit: 20, total: 1 } })
    await flushPromises()
    expect(wrapper.text()).toContain('Administrator access required')
    expect(wrapper.text()).not.toContain('Maple')
  })

  it('uses translated controls in dark mode without translating user content', async () => {
    applyAccountPreferences({ language: 'zh-HK', theme: 'dark' })
    const wrapper = await render(admin)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(wrapper.text()).toContain('安全審核')
    expect(wrapper.text()).toContain('Maple')
    expect(wrapper.text()).toContain('Repeated misleading listing.')
  })

  it('provides the moderation workflow in Simplified Chinese', async () => {
    applyAccountPreferences({ language: 'zh-CN', theme: 'light' })
    const wrapper = await render(admin)
    expect(wrapper.text()).toContain('安全审核')
    expect(wrapper.text()).toContain('待审核')
    expect(wrapper.text()).toContain('Maple')
  })
})
