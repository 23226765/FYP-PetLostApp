import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App.vue'
import appSource from '../../App.vue?raw'
import AuthScreen from '../AuthScreen.vue'
import { i18n } from '../../i18n'
import type { Pet } from '../../types/pet'
import { useSavedPets } from '../../composables/useSavedPets'
import { setSessionToken } from '../../services/authSession'

const apiMocks = vi.hoisted(() => ({
  getNearbyPets: vi.fn(),
  getMapPets: vi.fn(),
  getNotifications: vi.fn(),
  getChatInbox: vi.fn(),
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
  props: ['pets', 'radiusKm'],
  emits: ['found', 'notifications', 'radius-change'],
  setup(props, { emit }) {
    return () => h('div', [h('p', { class: 'stub-radar-results' }, (props.pets || []).map((item: Pet) => item.id).join(',')), h('button', { class: 'stub-radar-radius', onClick: () => emit('radius-change', 20) }, String(props.radiusKm)), h('button', { class: 'stub-found', onClick: () => emit('found', pet) }, 'Found'), h('button', { class: 'stub-notifications', onClick: () => emit('notifications') }, 'Notifications')])
  },
})

const AuthStub = defineComponent({
  props: ['sessionError'],
  emits: ['close', 'guest', 'failed', 'authenticated', 'retry-session'],
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
      <p class="stub-session-error">{{ sessionError }}</p>
      <button class="stub-retry-session" @click="$emit('retry-session')">Retry</button>
      <button class="stub-guest" @click="$emit('guest')">Guest</button>
      <button class="stub-close" @click="$emit('close')">Close</button>
      <button class="stub-failed" @click="$emit('failed')">Fail</button>
      <button class="stub-authenticated" @click="$emit('authenticated', user)">Authenticate</button>
    </div>
  `,
})

async function renderApp(token?: string, realMap = false) {
  if (token) localStorage.setItem('token', token)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/login', name: 'login', component: { template: '<div />' } },
      { path: '/map', name: 'map', component: { template: '<div />' } },
      { path: '/pets/:id', name: 'pet-detail', component: { template: '<div />' } },
      { path: '/profile', name: 'profile', component: { template: '<div />' } },
      { path: '/settings', name: 'settings', component: { emits: ['logout'], template: '<button class="stub-logout" @click="$emit(\'logout\')">Logout</button>' } },
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
        MapScreen: realMap ? false : { props: ['active'], emits: ['open-pet'], template: '<button class="stub-map-pet" @click="$emit(\'open-pet\', \'pet-one\')">Map pet</button>' },
        MapView: { name: 'MapView', props: ['discoveryPets', 'center', 'initialZoom', 'initialBounds'], template: '<div class="stub-map-view" />' },
        PostPetScreen: { template: '<div data-testid="post-pet" />' },
        ChatInboxScreen: { template: '<div />' },
        ProfileScreen: { props: ['user'], template: '<p class="stub-profile-id">{{ user?.id }}</p>' },
        PetDetail: { template: '<div />' },
        AuthScreen: AuthStub,
        SmartMatchScreen: { template: '<div />' },
        PosterModal: { template: '<div />' },
        Chatscreen: { props: ['pet'], template: '<p class="stub-chat-target">{{ pet.id }}:{{ pet.participantId }}</p>' },
        NotificationsPanel: { props: ['notifications', 'targetError'], emits: ['open-chat', 'close'], template: '<div class="stub-notification-panel"><p class="stub-target-error">{{ targetError }}</p><button class="stub-message-notification" @click="$emit(\'open-chat\', notifications[0])">Open conversation</button></div>' },
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
    apiMocks.getChatInbox.mockResolvedValue([])
    apiMocks.updateNotificationPreferences.mockResolvedValue(undefined)
  })

  it('keeps all six destinations and routes a guest map marker to the authorized detail by unique ID', async () => {
    const { wrapper, router } = await renderApp()
    const buttons = wrapper.findAll('.tabbar > button')
    expect(buttons).toHaveLength(6)
    expect(buttons.map(button => button.text())).toEqual(['Radar', 'Rescue', 'Report', 'Messages', 'Map', 'Profile'])
    const mapButton = buttons.find(button => button.text() === 'Map')
    expect(mapButton).toBeDefined()
    await mapButton!.trigger('click'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/map')
    expect(mapButton!.attributes('aria-current')).toBe('page')
    expect(wrapper.get('.stub-map-pet').isVisible()).toBe(true)
    await wrapper.get('.stub-map-pet').trigger('click'); await flushPromises()
    expect(router.currentRoute.value.name).toBe('pet-detail')
    expect(router.currentRoute.value.params.id).toBe('pet-one')
    expect(router.currentRoute.value.query.from).toBe('map')
    wrapper.unmount()
  })

  it('Radar radius changes Radar results but never Map requests, camera, markers or retained pages', async () => {
    vi.useFakeTimers()
    let wrapper: Awaited<ReturnType<typeof renderApp>>['wrapper'] | undefined
    try {
      apiMocks.getNearbyPets.mockImplementation(({ radiusKm }) => Promise.resolve(radiusKm === 20 ? [pet, { ...pet, id: 'radar-only' }] : [pet]))
      const areaInsights = { total: 1, speciesCounts: { dog: 1, cat: 0, other: 0 }, unclassifiedSpeciesCount: 0, topDistricts: ['Sha Tin'], topDistrictCount: 1, unknownDistrictCount: 0, unknownIsTop: false, recentCount: 1, unknownDateCount: 0, futureDateCount: 0, windowStart: '2026-10-21T12:00:00Z', windowEnd: '2026-10-28T12:00:00Z' }
      apiMocks.getMapPets.mockResolvedValue({ markers: [{ ...pet, id: 'map-only', locationSource: 'stored_report' }], pagination: { page: 1, limit: 100, total: 1, totalPages: 1, hasMore: false }, bounds: { west: 113.82, south: 22.15, east: 114.5, north: 22.57 }, gridSizeMeters: 750, insights: areaInsights })
      ;({ wrapper } = await renderApp(undefined, true))
      const nav = (label: string) => wrapper!.findAll('.tabbar > button').find(button => button.text() === label)!
      await nav('Map').trigger('click'); await flushPromises()
      const map = wrapper.getComponent({ name: 'MapView' })
      const area = { west: 114.1, east: 114.3, south: 22.3, north: 22.5 }
      map.vm.$emit('view-change', { lat: 22.4, lng: 114.2, zoom: 15, bounds: area })
      await vi.advanceTimersByTimeAsync(300); await flushPromises()
      const request = { ...apiMocks.getMapPets.mock.calls.at(-1)?.[0] }
      const calls = apiMocks.getMapPets.mock.calls.length, markers = map.props('discoveryPets')
      expect(request).toMatchObject(area)
      expect(request).not.toHaveProperty('radiusKm')
      expect(request).not.toHaveProperty('lat')
      await nav('Radar').trigger('click'); await flushPromises()
      await wrapper.get('.stub-radar-radius').trigger('click'); await vi.advanceTimersByTimeAsync(400); await flushPromises()
      expect(apiMocks.getNearbyPets.mock.calls.at(-1)?.[0].radiusKm).toBe(20)
      expect(wrapper.get('.stub-radar-results').text()).toContain('radar-only')
      expect(apiMocks.getMapPets).toHaveBeenCalledTimes(calls)
      await nav('Map').trigger('click'); await flushPromises()
      expect(apiMocks.getMapPets).toHaveBeenCalledTimes(calls)
      const restored = wrapper.getComponent({ name: 'MapView' })
      expect(restored.props('center')).toEqual({ lat: 22.4, lng: 114.2 })
      expect(restored.props('initialZoom')).toBe(15)
      expect(restored.props('discoveryPets')).toEqual(markers)
      expect(wrapper.getComponent({ name: 'AreaInsightsCard' }).props('insights')).toEqual(areaInsights)
      expect(wrapper.get('.stub-radar-radius').text()).toBe('20')
      expect(apiMocks.getMapPets.mock.calls.at(-1)?.[0]).toEqual(request)
      expect(apiMocks.updateNotificationPreferences).not.toHaveBeenCalled()
    } finally { wrapper?.unmount(); vi.useRealTimers() }
  })

  it('activates only the confirmed restored account and clears its saved scope on logout', async () => {
    localStorage.setItem('pawradar_saved_pets', '["unattributable"]')
    localStorage.setItem('pawradar_saved_pets:v2:guest', '["guest-pet"]')
    localStorage.setItem('pawradar_saved_pets:v2:user:owner-id', '["owner-pet"]')
    let finish!: (value: unknown) => void
    apiMocks.getProfile.mockReturnValue(new Promise(resolve => { finish = resolve }))
    const { wrapper, router } = await renderApp('owner-fixture')
    const saved = useSavedPets()
    expect(saved.savedContext.value.ready).toBe(false)
    expect(saved.savedPetIds.value).toEqual([])
    finish({ id: 'owner-id', name: 'Owner', email: 'owner@example.test', alertsEnabled: false })
    await flushPromises()
    expect(saved.savedPetIds.value).toEqual(['owner-pet'])
    await router.push('/settings'); await wrapper.get('.stub-logout').trigger('click'); await flushPromises()
    expect(saved.savedPetIds.value).toEqual(['guest-pet'])
    expect(localStorage.getItem('pawradar_saved_pets')).toBe('["unattributable"]')
    wrapper.unmount()
  })

  it('activates login identity after auth clearing and does not reuse owner saves for the finder', async () => {
    localStorage.setItem('pawradar_saved_pets:v2:user:owner-id', '["owner-pet"]')
    localStorage.setItem('pawradar_saved_pets:v2:user:finder-id', '["finder-pet"]')
    const { wrapper } = await renderApp()
    setSessionToken('finder-fixture') // AuthScreen sets the token before authenticated emit.
    await wrapper.get('.stub-authenticated').trigger('click'); await flushPromises()
    expect(useSavedPets().savedContext.value.accountId).toBe('finder-id')
    expect(useSavedPets().savedPetIds.value).toEqual(['finder-pet'])
    wrapper.unmount()
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

  it.each(['available', 'unavailable', 'account-switch'])('message notification target is authorized and stale-safe: %s', async state => {
    apiMocks.getProfile.mockResolvedValue({ id: 'owner-id', name: 'Owner', email: 'owner@example.test', alertsEnabled: false })
    apiMocks.getNotifications.mockResolvedValue([{ id: 'notice', type: 'message', read: false, conversation: { petId: pet.id, participantId: 'finder-two', messageId: 'message' } }])
    const { wrapper } = await renderApp('owner-fixture')
    await wrapper.get('.stub-notifications').trigger('click'); await flushPromises()
    let finish!: (value: unknown) => void
    if (state === 'available') apiMocks.getChatInbox.mockResolvedValue([
      { pet: { ...pet, participantId: 'finder-one' } }, { pet: { ...pet, participantId: 'finder-two' } },
    ])
    else if (state === 'account-switch') apiMocks.getChatInbox.mockReturnValue(new Promise(resolve => { finish = resolve }))
    await wrapper.get('.stub-message-notification').trigger('click'); await flushPromises()
    if (state === 'available') expect(wrapper.get('.stub-chat-target').text()).toBe(`${pet.id}:finder-two`)
    else if (state === 'unavailable') {
      expect(wrapper.find('.stub-chat-target').exists()).toBe(false)
      expect(wrapper.get('.stub-target-error').text()).toContain('conversation is unavailable')
    } else {
      localStorage.setItem('token', 'another-fixture')
      window.dispatchEvent(new StorageEvent('storage', { key: 'token', oldValue: 'owner-fixture', newValue: 'another-fixture' }))
      finish([{ pet: { ...pet, participantId: 'finder-two' } }]); await flushPromises()
      expect(wrapper.find('.stub-chat-target').exists()).toBe(false)
    }
    wrapper.unmount()
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

  it('keeps the session through a temporary restore failure and can retry successfully', async () => {
    apiMocks.getProfile.mockRejectedValueOnce(Object.assign(new Error('Temporary DB failure'), { status: 503, apiCode: 'AUTH_SERVICE_UNAVAILABLE' }))
    const { wrapper } = await renderApp('owner-session')
    expect(localStorage.getItem('token')).toBe('owner-session')
    expect(wrapper.get('.stub-session-error').text()).toContain('temporarily unavailable')
    apiMocks.getProfile.mockResolvedValueOnce({ id: 'owner-id', name: 'Owner', email: 'owner@example.test', alertsEnabled: false })
    await wrapper.get('.stub-retry-session').trigger('click'); await flushPromises()
    expect(wrapper.find('[data-testid="auth-screen"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('removes truly invalid credentials rather than showing a service outage', async () => {
    apiMocks.getProfile.mockRejectedValueOnce(Object.assign(new Error('Invalid token'), { status: 401 }))
    const { wrapper } = await renderApp('invalid-fixture')
    expect(localStorage.getItem('token')).toBeNull()
    expect(wrapper.get('.stub-session-error').text()).toBe('')
    wrapper.unmount()
  })

  it('cross-tab logout immediately clears the identity and creation/privileged overlays', async () => {
    apiMocks.getProfile.mockResolvedValue({ id: 'owner-id', name: 'Owner', email: 'owner@example.test', alertsEnabled: false })
    const { wrapper, router } = await renderApp('owner-fixture')
    await wrapper.get('.report-item').trigger('click'); await flushPromises()
    expect(wrapper.find('[data-testid="post-pet"]').exists()).toBe(true)
    localStorage.removeItem('token')
    window.dispatchEvent(new StorageEvent('storage', { key: 'token', oldValue: 'owner-fixture', newValue: null }))
    await flushPromises()
    expect(wrapper.find('[data-testid="post-pet"]').exists()).toBe(false)
    expect(wrapper.find('.sheet').exists()).toBe(false)
    expect(router.currentRoute.value.path).toBe('/login')
    expect(wrapper.find('[data-testid="auth-screen"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('cross-tab switching clears the old identity while the new account is being restored', async () => {
    apiMocks.getProfile.mockResolvedValueOnce({ id: 'owner-id', name: 'Owner', email: 'owner@example.test', alertsEnabled: false })
    const { wrapper } = await renderApp('owner-fixture')
    await wrapper.get('.tabbar .nav-item:last-child').trigger('click'); await flushPromises()
    expect(wrapper.get('.stub-profile-id').text()).toBe('owner-id')
    let resolve!: (value: unknown) => void
    apiMocks.getProfile.mockReturnValueOnce(new Promise((yes) => { resolve = yes }))
    localStorage.setItem('token', 'finder-fixture')
    window.dispatchEvent(new StorageEvent('storage', { key: 'token', oldValue: 'owner-fixture', newValue: 'finder-fixture' }))
    await flushPromises()
    expect(wrapper.text()).not.toContain('owner-id')
    resolve({ id: 'finder-id', name: 'Finder', email: 'finder@example.test', alertsEnabled: false, preferences: { language: 'en', theme: 'dark' } })
    await flushPromises()
    await wrapper.get('.tabbar .nav-item:last-child').trigger('click'); await flushPromises()
    expect(wrapper.get('.stub-profile-id').text()).toBe('finder-id')
    wrapper.unmount()
  })

  it('explicit logout clears the token and returns to login', async () => {
    apiMocks.getProfile.mockResolvedValueOnce({ id: 'owner-id', name: 'Owner', email: 'owner@example.test', alertsEnabled: false })
    const { wrapper, router } = await renderApp('owner-fixture')
    await router.push('/settings'); await flushPromises()
    await wrapper.get('.stub-logout').trigger('click'); await flushPromises()
    expect(localStorage.getItem('token')).toBeNull()
    expect(router.currentRoute.value.path).toBe('/login')
    expect(wrapper.find('[data-testid="auth-screen"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('late session restoration cannot reauthenticate after cross-tab logout', async () => {
    let finish!: (value: unknown) => void
    apiMocks.getProfile.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const { wrapper } = await renderApp('old-fixture')
    localStorage.removeItem('token')
    window.dispatchEvent(new StorageEvent('storage', { key: 'token', oldValue: 'old-fixture', newValue: null }))
    await flushPromises()
    finish({ id: 'obsolete-user', name: 'Old account', email: 'old@example.test', alertsEnabled: true })
    await flushPromises()
    expect(localStorage.getItem('token')).toBeNull()
    expect(wrapper.find('[data-testid="auth-screen"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('obsolete-user')
    expect(apiMocks.updateNotificationPreferences).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
