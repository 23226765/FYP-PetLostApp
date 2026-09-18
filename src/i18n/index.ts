import { createI18n } from 'vue-i18n'
import en from '../locales/en.json'
import zhHK from '../locales/zh-HK.json'
import zhCN from '../locales/zh-CN.json'
import type { AppLanguage } from '../types/user'

export const SUPPORTED_LANGUAGES: readonly AppLanguage[] = ['en', 'zh-HK', 'zh-CN']

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  fallbackWarn: false,
  missingWarn: false,
  escapeParameter: true,
  messages: {
    en,
    'zh-HK': zhHK,
    'zh-CN': zhCN,
  },
  datetimeFormats: {
    en: {
      short: { year: 'numeric', month: 'short', day: 'numeric' },
      dateTime: { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
    },
    'zh-HK': {
      short: { year: 'numeric', month: 'short', day: 'numeric' },
      dateTime: { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false },
    },
    'zh-CN': {
      short: { year: 'numeric', month: 'short', day: 'numeric' },
      dateTime: { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false },
    },
  },
  numberFormats: {
    en: { decimal: { maximumFractionDigits: 1 } },
    'zh-HK': { decimal: { maximumFractionDigits: 1 } },
    'zh-CN': { decimal: { maximumFractionDigits: 1 } },
  },
})

export function useAppI18n() {
  return i18n.global
}

export function translateApiError(error: unknown, fallbackKey = 'errors.generic') {
  const code = error instanceof Error
    ? (error as Error & { apiCode?: string }).apiCode
    : undefined
  const keyByCode: Record<string, string> = {
    INVALID_PREFERENCES_BODY: 'errors.savePreferences',
    EMPTY_PREFERENCES_UPDATE: 'errors.savePreferences',
    UNEXPECTED_PREFERENCE_FIELD: 'errors.savePreferences',
    UNSUPPORTED_LANGUAGE: 'errors.savePreferences',
    UNSUPPORTED_THEME: 'errors.savePreferences',
    USER_NOT_FOUND: 'errors.generic',
  }
  return i18n.global.t(code && keyByCode[code] ? keyByCode[code] : fallbackKey)
}
