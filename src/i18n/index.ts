import { createI18n } from 'vue-i18n'
import en from '../locales/en.json'
import zhHK from '../locales/zh-HK.json'
import zhCN from '../locales/zh-CN.json'
import zhHKExtra from '../locales/zh-HK-extra.json'
import zhCNExtra from '../locales/zh-CN-extra.json'
import type { AppLanguage } from '../types/user'

export const SUPPORTED_LANGUAGES: readonly AppLanguage[] = ['en', 'zh-HK', 'zh-CN']

function mergeLocale<T extends Record<string, unknown>>(base: T, extra: Record<string, unknown>): T {
  const result = { ...base } as Record<string, unknown>
  for (const [key, value] of Object.entries(extra)) {
    const current = result[key]
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeLocale((current && typeof current === 'object' ? current : {}) as Record<string, unknown>, value as Record<string, unknown>)
      : value
  }
  return result as T
}

const zhHKMessages = mergeLocale(zhHK, zhHKExtra)
const zhCNMessages = mergeLocale(zhCN, zhCNExtra)

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  fallbackWarn: false,
  missingWarn: false,
  escapeParameter: true,
  messages: {
    en,
    'zh-HK': zhHKMessages,
    'zh-CN': zhCNMessages,
  },
  datetimeFormats: {
    en: {
      time: { hour: 'numeric', minute: '2-digit' },
      short: { year: 'numeric', month: 'short', day: 'numeric' },
      dateTime: { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
    },
    'zh-HK': {
      time: { hour: '2-digit', minute: '2-digit', hour12: false },
      short: { year: 'numeric', month: 'short', day: 'numeric' },
      dateTime: { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false },
    },
    'zh-CN': {
      time: { hour: '2-digit', minute: '2-digit', hour12: false },
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
    SUBMISSION_CONFLICT: 'rescueRepair.submissionConflict',
    SECURE_ID_UNAVAILABLE: 'reportLocation.secureIdUnavailable',
    PET_LOCATION_INVALID: 'reportLocation.required',
    CHAT_UNAVAILABLE: 'messageRepair.unavailable',
    NOTIFICATION_UNAVAILABLE: 'messageRepair.unavailable',
    NETWORK_UNAVAILABLE: 'errors.network',
    AUTH_INVALID_CREDENTIALS: 'messageRepair.credentials',
    EMAIL_IN_USE: 'messageRepair.emailInUse',
    CHAT_PARTICIPANT_REQUIRED: 'messageRepair.participantRequired',
    CHAT_MESSAGE_REQUIRED: 'messageRepair.messageRequired',
    CHAT_MESSAGE_TOO_LONG: 'messageRepair.messageTooLong',
    CHAT_READ_INVALID: 'messageRepair.invalidRead',
    INVALID_REQUEST_DATA: 'messageRepair.invalidData',
    FIELD_REQUIRED: 'messageRepair.requiredField',
    FIELD_TOO_LONG: 'messageRepair.fieldTooLong',
    FIELD_INVALID: 'messageRepair.invalidField',
    EMAIL_INVALID: 'messageRepair.email',
    PASSWORD_TOO_SHORT: 'messageRepair.password',
    LOCATION_INVALID: 'messageRepair.location',
    DISTRICT_INVALID: 'messageRepair.district',
    CONTACT_INVALID: 'messageRepair.contact',
    COMMENT_INVALID: 'messageRepair.comment',
    OBSERVED_TIME_INVALID: 'messageRepair.observedTime',
    RESOURCE_NOT_FOUND: 'messageRepair.notFound',
    IMAGE_INVALID: 'media.invalid',
    IMAGE_TOO_LARGE: 'media.tooLarge',
    IMAGE_OUTPUT_TOO_LARGE: 'media.tooLarge',
    IMAGE_REQUEST_INVALID: 'media.invalid',
    IMAGE_IDS_REQUIRED: 'media.invalid',
    IMAGE_PURPOSE_INVALID: 'media.forbidden',
    IMAGE_ATTACHMENT_FORBIDDEN: 'media.forbidden',
    IMAGE_NOT_FOUND: 'media.forbidden',
    IMAGE_IDEMPOTENCY_CONFLICT: 'media.forbidden',
    IMAGE_STORAGE_CONFIG_INVALID: 'media.unavailable',
    IMAGE_UPLOADS_DISABLED: 'media.unavailable',
    IMAGE_STORAGE_UNAVAILABLE: 'media.unavailable',
    IMAGE_STORAGE_CONFLICT: 'media.unavailable',
    IMAGE_DATABASE_UNAVAILABLE: 'media.saveFailed',
    IMAGE_PROCESSING_BUSY: 'media.unavailable',
    IMAGE_UPLOAD_IN_PROGRESS: 'media.unavailable',
    IMAGE_UPLOAD_RETRY_REQUIRED: 'media.unavailable',
    IMAGE_UPLOAD_QUOTA: 'errors.rateLimited',
    IMAGE_RECOVERY_QUOTA: 'mediaRecovery.limit',
    AUTH_CONTEXT_CHANGED: 'media.authChanged',
    AUTH_SERVICE_UNAVAILABLE: 'errors.authenticationUnavailable',
    IMAGE_CANCELLED: 'media.cancelled',
    INVALID_PREFERENCES_BODY: 'errors.savePreferences',
    EMPTY_PREFERENCES_UPDATE: 'errors.savePreferences',
    UNEXPECTED_PREFERENCE_FIELD: 'errors.savePreferences',
    UNSUPPORTED_LANGUAGE: 'errors.savePreferences',
    UNSUPPORTED_THEME: 'errors.savePreferences',
    USER_NOT_FOUND: 'errors.generic',
    RATE_LIMITED: 'errors.rateLimited',
    USER_BLOCKED: 'safety.blockedInteraction',
    SELF_REPORT: 'safety.submitError',
    SELF_BLOCK: 'safety.blockError',
    SHELTER_ADMIN_REQUIRED: 'moderation.deniedHelp',
    INVALID_REPORT_STATUS: 'moderation.updateError',
    INVALID_MODERATION_BODY: 'moderation.updateError',
    INVALID_MODERATOR_NOTE: 'moderation.updateError',
    INVALID_VISIBILITY_BODY: 'moderation.visibilityError',
    UNSUPPORTED_VISIBILITY_TARGET: 'moderation.visibilityError',
    INVALID_VISIBILITY_STATUS: 'moderation.visibilityError',
    MODERATION_REASON_REQUIRED: 'moderation.visibilityReasonRequired',
    CONTENT_NOT_FOUND: 'moderation.visibilityError',
    REPORT_NOT_FOUND: 'moderation.updateError',
  }
  const detail = error as { field?: unknown; params?: Record<string, unknown> } | null
  const fieldKeys: Record<string, string> = { name: 'settings.displayName', realName: 'settings.realName', email: 'authentication.email', phone: 'authentication.phone', password: 'authentication.password', locationName: 'sightings.locationName', district: 'pets.districtLabel', description: 'pets.communityDetails' }
  const field = typeof detail?.field === 'string' && fieldKeys[detail.field] ? i18n.global.t(fieldKeys[detail.field]) : i18n.global.t('messageRepair.formField')
  const bounded = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10000 ? value : fallback
  return i18n.global.t(code && keyByCode[code] ? keyByCode[code] : fallbackKey, {
    field, max: bounded(detail?.params?.max, code === 'CHAT_MESSAGE_TOO_LONG' ? 2000 : code === 'COMMENT_INVALID' ? 500 : 100),
    min: bounded(detail?.params?.min, 6),
  })
}
