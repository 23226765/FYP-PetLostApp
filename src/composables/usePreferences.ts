import { computed, readonly, ref } from 'vue'
import { i18n, SUPPORTED_LANGUAGES } from '../i18n'
import { updateUserPreferences } from '../services/api'
import type { AppLanguage, AppTheme, UserPreferences } from '../types/user'
import { captureAuthContext, isAuthContextCurrent, authContextError } from '../services/authSession'

const STORAGE_KEY = 'pawradar_preferences_v1'
const DEFAULTS: UserPreferences = { language: 'en', theme: 'light' }
const SUPPORTED_THEMES: readonly AppTheme[] = ['light', 'dark']

function browserLanguage(): AppLanguage {
  if (typeof navigator === 'undefined') return DEFAULTS.language
  const language = navigator.language.toLowerCase()
  if (language.startsWith('zh-hk') || language.startsWith('zh-tw') || language.includes('hant')) return 'zh-HK'
  if (language.startsWith('zh-cn') || language.startsWith('zh-sg') || language.includes('hans')) return 'zh-CN'
  return 'en'
}

export function normalizePreferences(value: unknown, fallbackToBrowser = false): UserPreferences {
  const input = value && typeof value === 'object' ? value as Partial<UserPreferences> : {}
  return {
    language: SUPPORTED_LANGUAGES.includes(input.language as AppLanguage)
      ? input.language as AppLanguage
      : fallbackToBrowser ? browserLanguage() : DEFAULTS.language,
    theme: SUPPORTED_THEMES.includes(input.theme as AppTheme)
      ? input.theme as AppTheme
      : DEFAULTS.theme,
  }
}

function readLocalPreferences(): UserPreferences {
  if (typeof localStorage === 'undefined') return DEFAULTS
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? normalizePreferences(JSON.parse(stored)) : normalizePreferences({}, true)
  } catch {
    return normalizePreferences({}, true)
  }
}

const initial = readLocalPreferences()
const language = ref<AppLanguage>(initial.language)
const theme = ref<AppTheme>(initial.theme)
const saving = ref(false)
const status = ref<'idle' | 'saved' | 'error'>('idle')
let requestSequence = 0

function applyDocumentPreferences(preferences: UserPreferences) {
  i18n.global.locale.value = preferences.language
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = preferences.theme
  document.documentElement.lang = preferences.language
  document.documentElement.style.colorScheme = preferences.theme
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  themeColor?.setAttribute('content', preferences.theme === 'dark' ? '#101817' : '#fcf9f2')
}

function persistLocal(preferences: UserPreferences) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  }
}

function apply(preferences: UserPreferences, persist = true) {
  language.value = preferences.language
  theme.value = preferences.theme
  applyDocumentPreferences(preferences)
  if (persist) persistLocal(preferences)
}

apply(initial, false)

export function applyAccountPreferences(value: unknown) {
  requestSequence += 1
  saving.value = false
  apply(normalizePreferences(value))
  status.value = 'idle'
}

export async function setPreferences(update: Partial<UserPreferences>) {
  const request = ++requestSequence
  const context = captureAuthContext()
  const active = () => request === requestSequence && isAuthContextCurrent(context)
  const previous: UserPreferences = { language: language.value, theme: theme.value }
  const next = normalizePreferences({ ...previous, ...update })
  apply(next)
  status.value = 'idle'

  if (typeof localStorage === 'undefined' || !localStorage.getItem('token')) return next

  saving.value = true
  try {
    const saved = normalizePreferences(await updateUserPreferences(update))
    if (!active()) throw authContextError()
    apply(saved)
    status.value = 'saved'
    return saved
  } catch (error) {
    if (active()) {
      apply(previous)
      status.value = 'error'
    }
    throw error
  } finally {
    if (active()) saving.value = false
  }
}

export function clearPreferenceStatus() {
  status.value = 'idle'
}

if (typeof window !== 'undefined') {
  window.addEventListener('auth:changed', () => {
    requestSequence += 1
    saving.value = false
    status.value = 'idle'
  })
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    try {
      apply(normalizePreferences(JSON.parse(event.newValue)), false)
    } catch {
      // Ignore malformed data from another tab and retain the valid local state.
    }
  })
}

export function usePreferences() {
  return {
    language: readonly(language),
    theme: readonly(theme),
    saving: readonly(saving),
    status: readonly(status),
    isDark: computed(() => theme.value === 'dark'),
    setPreferences,
    clearPreferenceStatus,
  }
}
