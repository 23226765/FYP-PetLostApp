import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App.vue'
import appSource from '../../App.vue?raw'
import AuthScreen from '../AuthScreen.vue'
import { i18n } from '../../i18n'
import type { Pet } from '../../types/pet'

const apiMocks = vi.hoisted(() => ({
  getNearbyPets: vi.fn(),
  getNotifications: vi.fn(),
  getPet: vi.fn(),
  getProfile: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  reportSighting: vi.fn(),
  updateNotificationPreferences: vi.fn(),
  uploadManagedImage: vi.fn(),
  discardManagedImage: vi.fn(),
}))

vi.mock('../../services/api', () => apiMocks)
vi.mock('../../services/geolocation', () => ({
  getCurrentLocation: vi.fn().mockRejectedValue(new Error('Location unavailable in test')),
}))
vi.mock('@capacitor/camera', () => ({
  Camera: { getPhoto: vi.fn() },
  CameraResultType: { DataUrl: 'dataUrl' },
}))

const pet: Pet = {
  id: 'pet-one',
  name: 'Maple',
  species: 'Dog',
  breed: 'Golden Retriever',
  photo: '',
  description: '',
  owner: 'Owner',
  canViewContact: false,
  reportedBy: 'owner-id',
  status: 'lost',
  location: 'Sha Tin',
  locationPrecision: 'approximate',
  lastSeen: 'Today',
  postedAgo: 'Today',
  coordinates: [114.18, 22.38],
  mapX: 50,
  mapY: 50,
}

const RadarStub = defineComponent({
  emits: ['found'],
  setup(_, { emit }) {
    return () => h('button', { class: 'stub-found', onClick: () => emit('found', pet) }, 'Found')
  },
})

const AuthStub = defineComponent({
  emits: ['close', 'guest', 'failed', 'authenticated'],
  setup() {
    return {
      user: {
        id: 'finder-id',
        name: 'Finder',
        email: 'finder@example.test',
        alertsEnabled: false,
        alertRadiusKm: 3,
        preferences: { language: 'en', theme: 'light' },
      },
    }
  },
  template: `
    <div data-testid="auth-screen">
      <button class="stub-guest" @click="$emit('guest')">Guest</button>
      <button class="stub-close" @click="$emit('close')">Close</button>
      <button class="stub-failed" @click="$emit('failed')">Fail</button>
      <button class="stub-authenticated" @click="$emit('authenticated', user)">Authenticate</button>
    </div>
  `,
})

async function renderApp(token?: string) {
  if (token) localStorage.setItem('token', token)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/login', name: 'login', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(App, {
    global: {
      plugins: [router, i18n],
      stubs: {
        AppIcon: { template: '<span />' },
        RadarScreen: RadarStub,
        StrayRescueScreen: { template: '<div />' },
        PostPetScreen: { template: '<div data-testid="post-pet" />' },
        ChatInboxScreen: { template: '<div />' },
        ProfileScreen: { template: '<div />' },
        PetDetail: { template: '<div />' },
        AuthScreen: AuthStub,
        SmartMatchScreen: { template: '<div />' },
        PosterModal: { template: '<div />' },
        Chatscreen: { template: '<div />' },
        NotificationsPanel: { template: '<div />' },
        BoostScreen: { template: '<div />' },
        SightingLocationPicker: { emits: ['update:modelValue'], template: '<button class="sighting-location-stub" @click="$emit(\'update:modelValue\', [114.18, 22.3])">Choose location</button>' },
      },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

function functionSource(name: string, nextName: string): string {
  const start = appSource.indexOf(`function ${name}`)
  const end = appSource.indexOf(`function ${nextName}`, start + 1)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return appSource.slice(start, end)
}

describe('authenticated creation entry points', () => {
  beforeEach(() => {
    localStorage.clear()
    i18n.global.locale.value = 'en'
    Object.values(apiMocks).forEach((mock) => mock.mockReset())
    apiMocks.getNearbyPets.mockResolvedValue([pet])
    apiMocks.getPet.mockResolvedValue(pet)
    apiMocks.getNotifications.mockResolvedValue([])
    apiMocks.updateNotificationPreferences.mockResolvedValue(undefined)
  })

  it('opens authentication instead of the lost-pet form for a guest', () => {
    const source = functionSource('goTab', 'openRescueReport')
    const guard = source.indexOf("t === 'post' && !currentUser.value")
    const mutation = source.indexOf('tab.value = t')

    expect(guard).toBeGreaterThanOrEqual(0)
    expect(source).toContain("openLogin({ type: 'post-pet' })")
    expect(source).toContain('return')
    expect(guard).toBeLessThan(mutation)
  })

  it('opens authentication instead of a sighting form for a guest', () => {
    const source = functionSource('openSighting', 'closeSighting')
    const guard = source.indexOf('!currentUser.value')
    const mutation = source.indexOf('sightingPet.value = pet')

    expect(guard).toBeGreaterThanOrEqual(0)
    expect(source).toContain("openLogin({ type: 'sighting', petId: String(pet.id) })")
    expect(source).toContain('return')
    expect(guard).toBeLessThan(mutation)
  })

  it('routes Smart Match posting through the same authenticated tab guard', () => {
    const source = functionSource('postFromSmartMatch', 'openPetById')
    expect(source).toContain("goTab('post')")
    expect(source).not.toContain("tab.value = 'post'")
  })

  it('keeps guest pet-report and sighting forms closed and routes to authentication', async () => {
    const { wrapper, router } = await renderApp()
    await wrapper.get('.stub-guest').trigger('click')

    await wrapper.get('.report-item').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(wrapper.find('[data-testid="post-pet"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="auth-screen"]').exists()).toBe(true)

    await wrapper.get('.stub-guest').trigger('click')
    await wrapper.get('.stub-found').trigger('click')
    await flushPromises()
    expect(wrapper.find('.sheet').exists()).toBe(false)
    expect(wrapper.find('[data-testid="auth-screen"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('allows an authenticated user to open both creation interfaces', async () => {
    apiMocks.getProfile.mockResolvedValue({
      id: 'finder-id',
      name: 'Finder',
      email: 'finder@example.test',
      alertsEnabled: false,
      alertRadiusKm: 3,
      preferences: { language: 'en', theme: 'light' },
    })
    const { wrapper } = await renderApp('valid-session-token')

    await wrapper.get('.report-item').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="post-pet"]').exists()).toBe(true)

    await wrapper.get('.stub-found').trigger('click')
    await flushPromises()
    expect(wrapper.find('.sheet').exists()).toBe(true)
    expect(wrapper.find('[data-testid="auth-screen"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('submits sighting photos using the authenticated uploader and ID-only payload', async () => {
    apiMocks.getProfile.mockResolvedValue({ id: 'finder-id', name: 'Finder', email: 'finder@example.test', alertsEnabled: false, preferences: { language: 'en', theme: 'light' } })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fictional-sighting')
    const id = 'c'.repeat(24)
    apiMocks.uploadManagedImage.mockResolvedValue({ id })
    apiMocks.reportSighting.mockResolvedValue({})
    const { wrapper } = await renderApp('fictional-sighting-test')
    await wrapper.get('.stub-found').trigger('click'); await flushPromises()
    await wrapper.get('.sighting-location-stub').trigger('click')
    await wrapper.get('.sheet-field input').setValue('Fictional park')
    const input = wrapper.get('.sheet input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['raster'], 'sighting.png', { type: 'image/png' })] })
    await input.trigger('change'); await wrapper.get('.sheet-send').trigger('click'); await flushPromises()
    expect(apiMocks.uploadManagedImage.mock.calls[0][1]).toBe('sighting')
    expect(apiMocks.reportSighting).toHaveBeenCalledWith(pet.id, expect.objectContaining({ imageIds: [id], submissionId: expect.any(String) }))
    expect(apiMocks.reportSighting.mock.calls[0][1]).not.toHaveProperty('photo')
    wrapper.unmount()
  })

  it('closing/reopening a sighting form prevents a late upload from submitting or changing the new form', async () => {
    apiMocks.getProfile.mockResolvedValue({ id: 'finder-id', name: 'Finder', email: 'finder@example.test', alertsEnabled: false, preferences: { language: 'en', theme: 'light' } })
    apiMocks.discardManagedImage.mockResolvedValue(undefined)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fictional-late-sighting')
    let finish: (value: { id: string }) => void = () => {}
    apiMocks.uploadManagedImage.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const { wrapper } = await renderApp('fictional-late-sighting-test')
    await wrapper.get('.stub-found').trigger('click'); await flushPromises()
    await wrapper.get('.sighting-location-stub').trigger('click')
    await wrapper.get('.sheet-field input').setValue('Fictional park')
    const input = wrapper.get('.sheet input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['raster'], 'sighting.png', { type: 'image/png' })] })
    await input.trigger('change'); await wrapper.get('.sheet-send').trigger('click')
    await wrapper.get('.scrim').trigger('click')
    await wrapper.get('.stub-found').trigger('click')
    finish({ id: 'e'.repeat(24) }); await flushPromises()
    expect(apiMocks.reportSighting).not.toHaveBeenCalled()
    expect(wrapper.find('.sheet').exists()).toBe(true)
    expect(wrapper.get('.sheet-send').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('resumes a guest pet-report intent exactly once after successful authentication', async () => {
    const { wrapper } = await renderApp()
    await wrapper.get('.stub-guest').trigger('click')
    await wrapper.get('.report-item').trigger('click')
    await wrapper.get('.stub-authenticated').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="post-pet"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="auth-screen"]').exists()).toBe(false)
    expect(apiMocks.reportSighting).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('resumes the correct guest sighting intent exactly once without submitting it', async () => {
    const { wrapper } = await renderApp()
    await wrapper.get('.stub-guest').trigger('click')
    await wrapper.get('.stub-found').trigger('click')
    await wrapper.get('.stub-authenticated').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.sheet')).toHaveLength(1)
    expect(wrapper.get('.sheet').text()).toContain('Maple')
    expect(apiMocks.reportSighting).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('clears a pending action after cancellation or authentication failure', async () => {
    const cancelled = await renderApp()
    await cancelled.wrapper.get('.stub-guest').trigger('click')
    await cancelled.wrapper.get('.report-item').trigger('click')
    await cancelled.wrapper.get('.stub-close').trigger('click')
    await flushPromises()
    await cancelled.wrapper.get('button[aria-label="Messages"]').trigger('click')
    await cancelled.wrapper.get('.stub-authenticated').trigger('click')
    await flushPromises()
    expect(cancelled.wrapper.find('[data-testid="post-pet"]').exists()).toBe(false)
    cancelled.wrapper.unmount()

    localStorage.clear()
    const failed = await renderApp()
    await failed.wrapper.get('.stub-guest').trigger('click')
    await failed.wrapper.get('.stub-found').trigger('click')
    await failed.wrapper.get('.stub-failed').trigger('click')
    await failed.wrapper.get('.stub-authenticated').trigger('click')
    await flushPromises()
    expect(failed.wrapper.find('.sheet').exists()).toBe(false)
    expect(apiMocks.reportSighting).not.toHaveBeenCalled()
    failed.wrapper.unmount()
  })

  it('clears intent through authorization-state resets and never carries it into account switching', () => {
    const clearSource = functionSource('clearAuthorizationScopedState', 'clearToastTimers')
    const authSource = functionSource('handleAuth', 'logout')
    expect(clearSource).toContain('pendingAuthAction.value = null')
    expect(authSource).toContain(
      'const pendingAction = currentUser.value ? null : pendingAuthAction.value',
    )
  })

  it('emits a failure signal so the parent can discard an intent after failed login', async () => {
    apiMocks.login.mockRejectedValue(new Error('Invalid credentials'))
    const wrapper = mount(AuthScreen, {
      global: { plugins: [i18n], stubs: { AppIcon: { template: '<span />' } } },
    })
    await wrapper.get('input[type="email"]').setValue('finder@example.test')
    await wrapper.get('input[type="password"]').setValue('incorrect-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.emitted('failed')).toHaveLength(1)
    expect(wrapper.emitted('authenticated')).toBeUndefined()
    wrapper.unmount()
  })

  it('shows a localized message when authentication is rate limited', async () => {
    i18n.global.locale.value = 'zh-HK'
    apiMocks.login.mockRejectedValue(
      Object.assign(new Error('Too many requests. Please try again later.'), { apiCode: 'RATE_LIMITED' }),
    )
    const wrapper = mount(AuthScreen, {
      global: { plugins: [i18n], stubs: { AppIcon: { template: '<span />' } } },
    })
    await wrapper.get('input[type="email"]').setValue('finder@example.test')
    await wrapper.get('input[type="password"]').setValue('incorrect-password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('要求次數過多，請稍候再試。')
    expect(wrapper.emitted('failed')).toHaveLength(1)
    wrapper.unmount()
  })
})
