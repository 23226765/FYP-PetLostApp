import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { getProfile, readManagedImage, getMessages, getChatInbox, sendMessage, markChatMessagesRead, getPet, getSavedStraysPage, setStraySaved } from '../api'
import { invalidateAuthContext, setSessionToken } from '../authSession'
import * as api from '../api'
import { applyAccountPreferences, setPreferences, usePreferences } from '../../composables/usePreferences'

const transport = vi.hoisted(() => vi.fn())
const coordinates: [number, number] = [114.17, 22.3]
const pet = { name: 'Synthetic', species: 'Dog' as const, district: 'Sha Tin', locationName: 'Synthetic', coordinates }
// Compile-time exhaustive: a new exported API operation must join this matrix.
const operations = {
  getNearbyPets: () => api.getNearbyPets({ lng: coordinates[0], lat: coordinates[1] }),
  getHotspots: () => api.getHotspots({ lng: coordinates[0], lat: coordinates[1] }),
  getSmartMatches: () => api.getSmartMatches({ species: 'Dog', coordinates }),
  getMyPetsPage: () => api.getMyPetsPage(),
  getMyPets: () => api.getMyPets(),
  getMySightings: () => api.getMySightings(),
  getPet: () => api.getPet('pet'),
  getPublicPet: () => api.getPublicPet('pet'),
  getPetSightings: () => api.getPetSightings('pet'),
  confirmSighting: () => api.confirmSighting('pet', 'sighting'),
  getNotifications: () => api.getNotifications(),
  updateNotificationPreferences: () => api.updateNotificationPreferences({ enabled: true, radiusKm: 3, coordinates }),
  markNotificationRead: () => api.markNotificationRead('notification'),
  markAllNotificationsRead: () => api.markAllNotificationsRead(),
  getChatInbox: () => api.getChatInbox(),
  getMessages: () => api.getMessages('pet', 'finder'),
  sendMessage: () => api.sendMessage('pet', { text: 'Synthetic' }),
  markChatMessagesRead: () => api.markChatMessagesRead('pet', 'finder', ['message']),
  reportLostPet: () => api.reportLostPet(pet),
  reportSighting: () => api.reportSighting('pet', { location: { type: 'Point', coordinates }, locationName: 'Synthetic', submissionId: 'retry-fixture' }),
  updatePetStatus: () => api.updatePetStatus('pet', 'reunited'),
  getNearbyStrays: () => api.getNearbyStrays({ lng: coordinates[0], lat: coordinates[1] }),
  getStrayById: () => api.getStrayById('stray'),
  getMyStraysPage: () => api.getMyStraysPage(),
  reportStray: () => api.reportStray({ ...pet, description: 'Synthetic', imageIds: ['image'], condition: 'healthy', observedAt: '2026-10-20T00:00:00Z', submissionId: 'retry-fixture' }),
  updateStrayStatus: () => api.updateStrayStatus('stray', 'rescued'),
  getStrayComments: () => api.getStrayComments('stray'),
  addStrayComment: () => api.addStrayComment('stray', 'Synthetic', 'retry-fixture'),
  removeStrayComment: () => api.removeStrayComment('stray', 'comment'),
  setStraySaved: () => api.setStraySaved('stray', true),
  getSavedStraysPage: () => api.getSavedStraysPage(),
  getSavedStrays: () => api.getSavedStrays(),
  updateStray: () => api.updateStray('stray', { description: 'Synthetic', species: 'Dog', animalType: '', condition: 'healthy' }),
  deleteStray: () => api.deleteStray('stray'),
  uploadManagedImage: () => api.uploadManagedImage(new Blob(['synthetic']), 'pet', 'retry-fixture'),
  discardManagedImage: () => api.discardManagedImage('image'),
  replaceContentImages: () => api.replaceContentImages('stray', 'stray', ['image']),
  readManagedImage: () => api.readManagedImage('/uploads/legacy/fixture.webp', new AbortController().signal),
  register: () => api.register({ name: 'Synthetic', email: 'synthetic@example.test', password: 'synthetic-fixture' }),
  login: () => api.login({ email: 'synthetic@example.test', password: 'synthetic-fixture' }),
  getProfile: () => api.getProfile(),
  updateProfile: () => api.updateProfile({ name: 'Synthetic' }),
  getContactPrivacy: () => api.getContactPrivacy(),
  updateContactPrivacy: () => api.updateContactPrivacy('private'),
  updateUserPreferences: () => api.updateUserPreferences({ language: 'zh-HK', theme: 'dark' }),
  reportContent: () => api.reportContent({ targetType: 'pet', targetId: 'pet', reason: 'spam' }),
  getBlockedUsers: () => api.getBlockedUsers(),
  blockUser: () => api.blockUser('user'),
  unblockUser: () => api.unblockUser('user'),
  getModerationReports: () => api.getModerationReports(),
  updateModerationReport: () => api.updateModerationReport('report', { status: 'actioned' }),
  updateContentVisibility: () => api.updateContentVisibility('stray', 'stray', { moderationStatus: 'hidden', reason: 'Synthetic' }),
} satisfies Record<keyof typeof api, () => Promise<unknown>>
vi.mock('axios', async (original) => {
  const module = await original<typeof import('axios')>()
  return { ...module, default: { ...module.default, create: (config: object) => module.default.create({ ...config, adapter: transport }) } }
})

describe('real Axios interceptors with isolated transport fixtures', () => {
  beforeEach(() => { localStorage.clear(); invalidateAuthContext(); transport.mockReset() })
  it.each([200, 401, 503])('actual API preference completion (%s) cannot roll back the replacement account', async status => {
    setSessionToken('initiating-fixture')
    applyAccountPreferences({ language: 'en', theme: 'light' })
    let finish!: () => void
    let dispatched!: () => void
    const ready = new Promise<void>(resolve => { dispatched = resolve })
    transport.mockImplementation((config: InternalAxiosRequestConfig) => new Promise((resolve, reject) => {
      finish = () => status === 200
        ? resolve({ config, status, statusText: 'OK', headers: {}, data: { preferences: { language: 'en', theme: 'light' } } })
        : reject(new AxiosError('Synthetic old save failure', undefined, config, undefined, { config, status, statusText: 'Failure', headers: {}, data: {} }))
      dispatched()
    }))
    const pending = setPreferences({ theme: 'dark' })
    await ready
    setSessionToken('replacement-fixture')
    applyAccountPreferences({ language: 'zh-HK', theme: 'dark' })
    finish()
    await expect(pending).rejects.toMatchObject({ apiCode: 'AUTH_CONTEXT_CHANGED' })
    expect(usePreferences().language.value).toBe('zh-HK')
    expect(usePreferences().theme.value).toBe('dark')
    expect(usePreferences().status.value).toBe('idle')
    expect(usePreferences().saving.value).toBe(false)
    expect(JSON.parse(localStorage.getItem('pawradar_preferences_v1') || '{}')).toEqual({ language: 'zh-HK', theme: 'dark' })
  })
  it.each(Object.entries(operations))('%s pins its initiating account before dispatch', async (_name, operation) => {
    for (const change of [
      () => setSessionToken('replacement-fixture'),
      () => setSessionToken(null),
      () => invalidateAuthContext(),
      () => { setSessionToken('temporary-fixture'); setSessionToken('initiating-fixture') },
      () => window.dispatchEvent(new StorageEvent('storage', { key: 'token', oldValue: 'initiating-fixture', newValue: 'replacement-fixture' })),
    ]) {
      setSessionToken('initiating-fixture')
      const pending = operation()
      change()
      await expect(pending).rejects.toMatchObject({ apiCode: 'AUTH_CONTEXT_CHANGED' })
      expect(transport).not.toHaveBeenCalled()
    }
  })
  it.each(Object.entries(operations))('%s rejects delayed success and errors from an obsolete account', async (_name, operation) => {
    for (const status of [200, 401, 503]) {
      setSessionToken('initiating-fixture')
      let finish!: () => void
      let dispatched!: () => void
      const ready = new Promise<void>(resolve => { dispatched = resolve })
      transport.mockImplementation((config: InternalAxiosRequestConfig) => new Promise((resolve, reject) => {
        expect(config.headers.Authorization).toBe('Bearer initiating-fixture')
        finish = () => status === 200
          ? resolve({ config, status, statusText: 'OK', headers: {}, data: {} })
          : reject(new AxiosError('Synthetic old failure', undefined, config, undefined, { config, status, statusText: 'Failure', headers: {}, data: {} }))
        dispatched()
      }))
      const pending = operation()
      await ready
      setSessionToken('replacement-fixture')
      finish()
      await expect(pending).rejects.toMatchObject({ apiCode: 'AUTH_CONTEXT_CHANGED' })
      expect(localStorage.getItem('token')).toBe('replacement-fixture')
    }
  })
  it('suppresses obsolete upload progress and completion without changing the multipart request', async () => {
    setSessionToken('initiating-fixture')
    const progress = vi.fn()
    let finish!: () => void
    let config!: InternalAxiosRequestConfig
    transport.mockImplementation((value: InternalAxiosRequestConfig) => new Promise(resolve => {
      config = value
      finish = () => resolve({ config, status: 200, statusText: 'OK', headers: {}, data: { image: { id: 'synthetic-image' } } })
    }))
    const pending = api.uploadManagedImage(new Blob(['synthetic']), 'avatar', 'stable-upload-retry', { onProgress: progress })
    await Promise.resolve(); await Promise.resolve()
    expect(config.data).toBeInstanceOf(FormData)
    expect(config.data.get('idempotencyKey')).toBe('stable-upload-retry')
    config.onUploadProgress?.({ loaded: 1, total: 2, bytes: 1, lengthComputable: true })
    expect(progress).toHaveBeenLastCalledWith(50)
    invalidateAuthContext()
    config.onUploadProgress?.({ loaded: 2, total: 2, bytes: 1, lengthComputable: true })
    finish()
    await expect(pending).rejects.toMatchObject({ apiCode: 'AUTH_CONTEXT_CHANGED' })
    expect(progress.mock.calls).toEqual([[50]])
  })
  it.each(['pet', 'saved-rescues', 'save', 'unsave'])('same-tick switching prevents a queued saved %s request using the next account', async operation => {
    setSessionToken('previous-saved-fixture')
    const request = operation === 'pet' ? getPet('fixture-pet')
      : operation === 'saved-rescues' ? getSavedStraysPage({ page: 2, limit: 20 })
        : setStraySaved('fixture-rescue', operation === 'save')
    setSessionToken('replacement-saved-fixture')
    await expect(request).rejects.toMatchObject({ apiCode: 'AUTH_CONTEXT_CHANGED' })
    expect(transport).not.toHaveBeenCalled()
  })
  it.each(['pet', 'saved-rescues'])('late %s unauthorized responses cannot log out a replacement account', async operation => {
    setSessionToken('previous-saved-fixture')
    let fail!: () => void
    transport.mockImplementation((config: InternalAxiosRequestConfig) => new Promise((_resolve, reject) => {
      fail = () => reject(new AxiosError('old unauthorized fixture', undefined, config, undefined, { config, status: 401, statusText: 'Unauthorized', headers: {}, data: {} }))
    }))
    const request = operation === 'pet' ? getPet('fixture-pet') : getSavedStraysPage()
    await Promise.resolve(); await Promise.resolve()
    setSessionToken('replacement-saved-fixture'); fail()
    await expect(request).rejects.toMatchObject({ apiCode: 'AUTH_CONTEXT_CHANGED' })
    expect(localStorage.getItem('token')).toBe('replacement-saved-fixture')
  })
  it.each(['read', 'send', 'thread', 'inbox'])('same-tick account switching cancels queued messaging %s before transport', async operation => {
    setSessionToken('previous-messaging-fixture')
    transport.mockImplementation(config => Promise.resolve({ config, status: 200, statusText: 'OK', headers: {}, data: { message: {}, messages: [], conversations: [] } }))
    const request = operation === 'read' ? markChatMessagesRead('pet', 'finder', ['incoming'])
      : operation === 'send' ? sendMessage('pet', { text: 'Previous account draft' })
        : operation === 'thread' ? getMessages('pet', 'finder') : getChatInbox()
    setSessionToken('replacement-messaging-fixture')
    await expect(request).rejects.toMatchObject({ apiCode: 'AUTH_CONTEXT_CHANGED' })
    expect(transport).not.toHaveBeenCalled()
    expect(localStorage.getItem('token')).toBe('replacement-messaging-fixture')
  })
  it.each([503, undefined])('temporary failure (%s) retains credentials and status', async (status) => {
    setSessionToken('fixture-session')
    transport.mockImplementation((config: InternalAxiosRequestConfig) => Promise.reject(new AxiosError('fixture outage', undefined, config, undefined,
      status ? { config, status, statusText: 'Unavailable', headers: {}, data: { code: 'AUTH_SERVICE_UNAVAILABLE' } } : undefined)))
    await expect(getProfile()).rejects.toMatchObject({ status })
    expect(localStorage.getItem('token')).toBe('fixture-session')
  })
  it('a genuine /auth/me 401 clears the session, unlike failed login credentials', async () => {
    setSessionToken('invalid-fixture')
    transport.mockImplementation((config: InternalAxiosRequestConfig) => Promise.reject(new AxiosError('invalid', undefined, config, undefined,
      { config, status: 401, statusText: 'Unauthorized', headers: {}, data: {} })))
    await expect(getProfile()).rejects.toMatchObject({ status: 401 })
    expect(localStorage.getItem('token')).toBeNull()
  })
  it('legacy image requests use Authorization headers and a token-free fixed API path', async () => {
    setSessionToken('fictional-legacy-token')
    transport.mockImplementation((config: InternalAxiosRequestConfig) => {
      expect(config.url).toBe('/uploads/legacy/private.webp')
      expect(config.headers.Authorization).toBe('Bearer fictional-legacy-token')
      expect(config.url).not.toContain('fictional-legacy-token')
      expect(config.responseType).toBe('blob')
      return Promise.resolve({ config, status: 200, statusText: 'OK', headers: {}, data: new Blob(['safe']) })
    })
    await expect(readManagedImage('/uploads/legacy/private.webp', new AbortController().signal)).resolves.toBeInstanceOf(Blob)
  })
  it.each(['success', 'failure'])('same-token invalidation rejects stale %s without changing the new context', async (outcome) => {
    setSessionToken('fixture-session')
    let finish!: () => void
    transport.mockImplementation((config: InternalAxiosRequestConfig) => new Promise((resolve, reject) => {
      finish = () => outcome === 'success'
        ? resolve({ config, status: 200, statusText: 'OK', headers: {}, data: { user: { id: 'obsolete' } } })
        : reject(new AxiosError('obsolete unauthorized', undefined, config, undefined, { config, status: 401, statusText: 'Unauthorized', headers: {}, data: {} }))
    }))
    const request = getProfile()
    await Promise.resolve(); await Promise.resolve()
    invalidateAuthContext()
    finish()
    await expect(request).rejects.toMatchObject({ apiCode: 'AUTH_CONTEXT_CHANGED' })
    expect(localStorage.getItem('token')).toBe('fixture-session')
  })
})
