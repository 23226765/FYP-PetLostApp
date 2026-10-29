import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { User } from '../../types/user'
import SettingsScreen from '../SettingsScreen.vue'
import { applyAccountPreferences, setPreferences, usePreferences } from '../../composables/usePreferences'
import { setSessionToken } from '../../services/authSession'

enableAutoUnmount(afterEach)
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const apiMocks = vi.hoisted(() => ({
  getContactPrivacy: vi.fn(),
  updateContactPrivacy: vi.fn(),
  updateProfile: vi.fn(),
  updateUserPreferences: vi.fn(),
  uploadManagedImage: vi.fn(),
  discardManagedImage: vi.fn(),
}))

vi.mock('../../services/api', () => apiMocks)

const user: User = {
  id: 'owner-id',
  name: 'FYP Owner',
  email: 'fyp.owner@pawradar.test',
  phone: '+852 5000 0101',
  privacy: { contactVisibility: 'private' },
}

async function mountSettings(currentUser: User = user) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/settings', component: { template: '<div />' } },
      { path: '/saved', component: { template: '<div />' } },
      { path: '/my-reports', component: { template: '<div />' } },
      { path: '/settings/blocked', component: { template: '<div />' } },
      { path: '/moderation', component: { template: '<div />' } },
    ],
  })
  await router.push('/settings')
  await router.isReady()
  const wrapper = mount(SettingsScreen, {
    props: { user: currentUser, alertsEnabled: true, radiusKm: 5 },
    global: {
      plugins: [router],
      stubs: { AppIcon: { template: '<span />' } },
    },
  })
  await flushPromises()
  return wrapper
}

describe('SettingsScreen contact privacy', () => {
  beforeEach(() => {
    apiMocks.getContactPrivacy.mockReset()
    apiMocks.updateContactPrivacy.mockReset()
    apiMocks.updateProfile.mockReset()
    apiMocks.updateUserPreferences.mockReset()
    localStorage.clear()
    applyAccountPreferences({ language: 'en', theme: 'light' })
    apiMocks.getContactPrivacy.mockResolvedValue({ contactVisibility: 'private' })
  })

  it('preserves current appearance when privacy succeeds with stale user preference props', async () => {
    localStorage.setItem('token', 'fictional-preferences-test')
    const wrapper = await mountSettings({ ...user, preferences: { language: 'en', theme: 'light' } })
    apiMocks.updateUserPreferences.mockResolvedValue({ language: 'zh-HK', theme: 'dark' })
    await setPreferences({ language: 'zh-HK', theme: 'dark' })
    apiMocks.updateContactPrivacy.mockResolvedValue({ contactVisibility: 'authenticated' })
    await wrapper.get('.contact-privacy input[value="authenticated"]').setValue(true)
    await wrapper.get('.save-privacy-button').trigger('click'); await flushPromises()
    // Reproduce the existing App's full-user update path when that event is emitted.
    const fullUser = wrapper.emitted('updated')?.at(-1)?.[0] as User | undefined
    if (fullUser) applyAccountPreferences(fullUser.preferences)
    expect(usePreferences().language.value).toBe('zh-HK')
    expect(usePreferences().theme.value).toBe('dark')
    expect(wrapper.emitted('privacy-updated')?.at(-1)).toEqual([{ userId: user.id, privacy: { contactVisibility: 'authenticated' } }])
    expect(wrapper.emitted('updated')).toBeUndefined()
    wrapper.unmount()
  })

  it.each(['success', 'failure'])('privacy completion does not cancel a pending appearance save (%s)', async outcome => {
    setSessionToken('fictional-settings-owner')
    const preference = deferred<{ language: 'en'; theme: 'dark' }>()
    apiMocks.updateUserPreferences.mockReturnValueOnce(preference.promise)
    apiMocks.updateContactPrivacy.mockResolvedValue({ contactVisibility: 'authenticated' })
    const wrapper = await mountSettings({ ...user, preferences: { language: 'en', theme: 'light' } })
    await wrapper.get('input[name="app-theme"][value="dark"]').setValue(true)
    await wrapper.get('.contact-privacy input[value="authenticated"]').setValue(true)
    await wrapper.get('.save-privacy-button').trigger('click'); await flushPromises()
    const fullUser = wrapper.emitted('updated')?.at(-1)?.[0] as User | undefined
    if (fullUser) applyAccountPreferences(fullUser.preferences)
    expect(usePreferences().saving.value).toBe(true)
    if (outcome === 'success') preference.resolve({ language: 'en', theme: 'dark' })
    else preference.reject(new Error('Synthetic preference failure'))
    await flushPromises()
    expect(usePreferences().theme.value).toBe(outcome === 'success' ? 'dark' : 'light')
    expect(usePreferences().saving.value).toBe(false)
    expect(wrapper.get('.contact-privacy input[value="authenticated"]').element).toHaveProperty('checked', true)
  })

  it.each(['success', 'failure'])('retains newer appearance while a privacy save is delayed (%s)', async outcome => {
    const privacy = deferred<{ contactVisibility: 'authenticated' }>()
    apiMocks.updateContactPrivacy.mockReturnValueOnce(privacy.promise)
    const wrapper = await mountSettings({ ...user, preferences: { language: 'en', theme: 'light' } })
    await wrapper.get('.contact-privacy input[value="authenticated"]').setValue(true)
    await wrapper.get('.save-privacy-button').trigger('click')
    await setPreferences({ language: 'zh-CN', theme: 'dark' })
    if (outcome === 'success') privacy.resolve({ contactVisibility: 'authenticated' })
    else privacy.reject(new Error('Synthetic privacy failure'))
    await flushPromises()
    expect(usePreferences().language.value).toBe('zh-CN')
    expect(usePreferences().theme.value).toBe('dark')
    expect(JSON.parse(localStorage.getItem('pawradar_preferences_v1')!)).toEqual({ language: 'zh-CN', theme: 'dark' })
    expect(wrapper.emitted('updated')).toBeUndefined()
    if (outcome === 'failure') {
      expect(wrapper.find('.privacy-message.error').exists()).toBe(true)
      expect(wrapper.get('.save-privacy-button').attributes('disabled')).toBeUndefined()
      expect(wrapper.get('.contact-privacy input[value="authenticated"]').element).toHaveProperty('checked', true)
    }
  })

  it.each(['success', 'failure'])('ignores an old privacy load without clearing a newer load (%s)', async outcome => {
    const old = deferred<{ contactVisibility: 'authenticated' }>(), next = deferred<{ contactVisibility: 'private' }>()
    apiMocks.getContactPrivacy.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
    const wrapper = await mountSettings()
    await wrapper.setProps({ user: { ...user, id: 'replacement', preferences: { language: 'zh-HK', theme: 'dark' } } })
    applyAccountPreferences({ language: 'zh-HK', theme: 'dark' })
    if (outcome === 'success') old.resolve({ contactVisibility: 'authenticated' })
    else old.reject(new Error('Old account load failed'))
    await flushPromises()
    expect(wrapper.get('.contact-privacy').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.privacy-message.error').exists()).toBe(false)
    expect(wrapper.emitted('privacy-updated')).toBeUndefined()
    next.resolve({ contactVisibility: 'private' }); await flushPromises()
    expect(wrapper.get('.contact-privacy').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('.contact-privacy input[value="private"]').element).toHaveProperty('checked', true)
    expect(usePreferences().theme.value).toBe('dark')
  })

  it.each(['success', 'failure'])('old privacy save cannot finish a replacement account save (%s)', async outcome => {
    const old = deferred<{ contactVisibility: 'authenticated' }>(), next = deferred<{ contactVisibility: 'authenticated' }>()
    apiMocks.updateContactPrivacy.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise)
    const wrapper = await mountSettings()
    await wrapper.get('.contact-privacy input[value="authenticated"]').setValue(true)
    await wrapper.get('.save-privacy-button').trigger('click')
    await wrapper.setProps({ user: { ...user, id: 'replacement' } }); await flushPromises()
    await wrapper.get('.contact-privacy input[value="authenticated"]').setValue(true)
    await wrapper.get('.save-privacy-button').trigger('click')
    if (outcome === 'success') old.resolve({ contactVisibility: 'authenticated' })
    else old.reject(new Error('Old account save failed'))
    await flushPromises()
    expect(wrapper.get('.save-privacy-button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.privacy-message').exists()).toBe(false)
    expect(wrapper.emitted('privacy-updated')).toBeUndefined()
    next.resolve({ contactVisibility: 'authenticated' }); await flushPromises()
    expect(wrapper.emitted('privacy-updated')).toEqual([[{ userId: 'replacement', privacy: { contactVisibility: 'authenticated' } }]])
  })

  it.each(['round-trip', 'logout', 'same-token', 'unmount'].flatMap(change => ['success', 'failure'].map(outcome => ({ change, outcome }))))('invalidates pending privacy writes on $change ($outcome)', async ({ change, outcome }) => {
    setSessionToken('fictional-privacy-context')
    const pending = deferred<{ contactVisibility: 'authenticated' }>()
    apiMocks.updateContactPrivacy.mockReturnValueOnce(pending.promise)
    const wrapper = await mountSettings()
    await wrapper.get('.contact-privacy input[value="authenticated"]').setValue(true)
    await wrapper.get('.save-privacy-button').trigger('click')
    if (change === 'round-trip') {
      await wrapper.setProps({ user: { ...user, id: 'temporary' } })
      await wrapper.setProps({ user: { ...user } }); await flushPromises()
    } else if (change === 'logout') {
      setSessionToken(null); await wrapper.setProps({ user: null })
    } else if (change === 'same-token') setSessionToken('fictional-privacy-context')
    else wrapper.unmount()
    if (outcome === 'success') pending.resolve({ contactVisibility: 'authenticated' })
    else pending.reject(new Error('Obsolete privacy failure'))
    await flushPromises()
    expect(wrapper.emitted('privacy-updated')).toBeUndefined()
    if (change === 'same-token') expect(wrapper.get('.contact-privacy').attributes('disabled')).toBeDefined()
    if (change === 'round-trip') expect(wrapper.get('.contact-privacy input[value="private"]').element).toHaveProperty('checked', true)
  })

  it.each(['success', 'failure'])('does not display stale preference feedback after account switching (%s)', async outcome => {
    setSessionToken('fictional-preference-context')
    const pending = deferred<{ language: 'en'; theme: 'dark' }>()
    apiMocks.updateUserPreferences.mockReturnValueOnce(pending.promise)
    const wrapper = await mountSettings()
    await wrapper.get('input[name="app-theme"][value="dark"]').setValue(true)
    setSessionToken('fictional-replacement-context')
    await wrapper.setProps({ user: { ...user, id: 'replacement' } })
    applyAccountPreferences({ language: 'zh-HK', theme: 'light' })
    if (outcome === 'success') pending.resolve({ language: 'en', theme: 'dark' })
    else pending.reject(new Error('Old preference failed'))
    await flushPromises()
    expect(wrapper.find('.preference-message').exists()).toBe(false)
    expect(usePreferences().language.value).toBe('zh-HK')
    expect(usePreferences().theme.value).toBe('light')
  })

  it('uploads an avatar as multipart, saves only its ID and updates the session immediately', async () => {
    localStorage.setItem('token', 'fictional-avatar-test')
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fictional-avatar')
    const id = 'a'.repeat(24)
    apiMocks.uploadManagedImage.mockResolvedValue({ id })
    apiMocks.updateProfile.mockResolvedValue({ ...user, avatar: `/api/uploads/managed/${id}/content` })
    const wrapper = await mountSettings()
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['raster'], 'avatar.png', { type: 'image/png' })] })
    await input.trigger('change'); await flushPromises()
    expect(apiMocks.uploadManagedImage).toHaveBeenCalledWith(expect.objectContaining({ size: 6 }), 'avatar', expect.any(String), expect.any(Object))
    expect(apiMocks.updateProfile).toHaveBeenCalledWith({ avatarImageId: id })
    expect(wrapper.emitted('updated')?.[0]?.[0]).toMatchObject({ avatar: `/api/uploads/managed/${id}/content` })
    wrapper.unmount()
  })

  it('editing unrelated profile fields never sends the legacy avatar or an image removal', async () => {
    apiMocks.updateProfile.mockResolvedValue({ ...user, avatar: '/uploads/legacy.jpg' })
    const wrapper = await mountSettings({ ...user, avatar: '/uploads/legacy.jpg' })
    await wrapper.get('.edit-button').trigger('click')
    await wrapper.get('.profile-form').trigger('submit'); await flushPromises()
    const body = apiMocks.updateProfile.mock.calls[0][0]
    expect(body.name).toBe(user.name)
    expect(body).not.toHaveProperty('avatar'); expect(body).not.toHaveProperty('avatarImageId')
    wrapper.unmount()
  })

  it('an account switch ignores a delayed avatar-save response from the previous account', async () => {
    localStorage.setItem('token', 'fictional-old-account')
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fictional-old-avatar')
    apiMocks.uploadManagedImage.mockResolvedValue({ id: 'f'.repeat(24) })
    let finish: (value: User) => void = () => {}
    apiMocks.updateProfile.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const wrapper = await mountSettings()
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['raster'], 'avatar.png', { type: 'image/png' })] })
    await input.trigger('change'); await flushPromises()
    await wrapper.setProps({ user: { ...user, id: 'other-id', name: 'Other fictional user', avatar: '/avatar.svg' } })
    finish({ ...user, avatar: '/api/uploads/managed/' + 'f'.repeat(24) + '/content' }); await flushPromises()
    expect(wrapper.emitted('updated')).toBeUndefined()
    expect(wrapper.get('.avatar-picker img').attributes('src')).toBe('/avatar.svg')
    wrapper.unmount()
  })

  it('loads the current setting and saves an accessible radio selection', async () => {
    apiMocks.updateContactPrivacy.mockResolvedValue({ contactVisibility: 'authenticated' })
    const wrapper = await mountSettings()
    const radios = wrapper.findAll('.contact-privacy input[type="radio"]')
    expect(radios).toHaveLength(2)
    expect(wrapper.get('.contact-privacy legend').text()).toBe('Contact privacy')
    expect(wrapper.findAll('.privacy-option')).toHaveLength(2)
    expect(wrapper.findAll('.privacy-option.option-card')).toHaveLength(2)
    expect(wrapper.findAll('.privacy-option .radio-indicator')).toHaveLength(2)
    expect(wrapper.get('.save-privacy-button').attributes('type')).toBe('button')
    expect((radios[0].element as HTMLInputElement).checked).toBe(true)

    await radios[1].setValue(true)
    expect(wrapper.findAll('.privacy-option')[0].classes()).not.toContain('selected')
    expect(wrapper.findAll('.privacy-option')[1].classes()).toContain('selected')
    await wrapper.get('.save-privacy-button').trigger('click')
    await flushPromises()

    expect(apiMocks.updateContactPrivacy).toHaveBeenCalledWith('authenticated')
    expect(wrapper.text()).toContain('Signed-in users can now access Call and WhatsApp options.')
    expect(wrapper.emitted('privacy-updated')?.[0]?.[0]).toEqual({ userId: user.id, privacy: { contactVisibility: 'authenticated' } })
    expect(wrapper.emitted('updated')).toBeUndefined()
  })

  it('shows a safe error without changing the current-user state', async () => {
    apiMocks.updateContactPrivacy.mockRejectedValue(new Error('Unable to save preference.'))
    const wrapper = await mountSettings()
    await wrapper.findAll('.contact-privacy input[type="radio"]')[1].setValue(true)
    await wrapper.get('.save-privacy-button').trigger('click')
    await flushPromises()
    expect(wrapper.get('.privacy-message.error').text()).toBe('Unable to save contact privacy.')
    expect(wrapper.emitted('updated')).toBeUndefined()
  })

  it('changes anonymous language and theme immediately with accessible controls', async () => {
    const wrapper = await mountSettings()
    const language = wrapper.get('input[name="app-language"][value="zh-HK"]')
    const dark = wrapper.get('input[name="app-theme"][value="dark"]')

    expect(wrapper.findAll('.segmented-control .option-card')).toHaveLength(5)
    expect(wrapper.findAll('.segmented-control .radio-indicator')).toHaveLength(5)

    await language.setValue(true)
    await dark.setValue(true)
    await flushPromises()

    expect(document.documentElement.lang).toBe('zh-HK')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(wrapper.text()).toContain('語言與外觀')
    expect(JSON.parse(localStorage.getItem('pawradar_preferences_v1') || '{}')).toEqual({
      language: 'zh-HK',
      theme: 'dark',
    })
  })

  it('keeps radios keyboard-focusable and exposes disabled state on the full option card', async () => {
    const wrapper = await mountSettings()
    const firstRadio = wrapper.get('.privacy-option input[type="radio"]')

    expect((firstRadio.element as HTMLInputElement).tabIndex).toBe(0)
    expect((firstRadio.element as HTMLInputElement).matches(':disabled')).toBe(false)
    expect(wrapper.get('.privacy-option').text()).toContain('Private')

    apiMocks.getContactPrivacy.mockImplementation(() => new Promise(() => {}))
    const loadingWrapper = await mountSettings()
    const disabledRadio = loadingWrapper.get('.privacy-option input[type="radio"]')
    expect((disabledRadio.element as HTMLInputElement).matches(':disabled')).toBe(true)
    expect(loadingWrapper.get('.contact-privacy').attributes('disabled')).toBeDefined()
  })

  it('rolls authenticated preference UI back when the API save fails', async () => {
    localStorage.setItem('token', 'test-token')
    apiMocks.updateUserPreferences.mockRejectedValue(Object.assign(new Error('failed'), {
      apiCode: 'UNSUPPORTED_THEME',
    }))
    const wrapper = await mountSettings()
    await wrapper.get('input[name="app-theme"][value="dark"]').setValue(true)
    await flushPromises()

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(wrapper.get('.preference-message.error').text()).toContain('previous selection has been restored')
  })

  it('shows the safety review route only to shelter administrators', async () => {
    const ordinary = await mountSettings()
    expect(ordinary.text()).not.toContain('Safety review')

    const admin = await mountSettings({ ...user, role: 'shelter_admin' })
    expect(admin.text()).toContain('Safety review')
    expect(admin.text()).toContain('Review community reports and record decisions')
  })
})
