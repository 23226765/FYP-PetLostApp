export const SUPPORTED_LANGUAGES = Object.freeze(['en', 'zh-HK', 'zh-CN'])
export const SUPPORTED_THEMES = Object.freeze(['light', 'dark'])
export const DEFAULT_PREFERENCES = Object.freeze({ language: 'en', theme: 'light' })

export function preferencesFor(user) {
  const language = SUPPORTED_LANGUAGES.includes(user?.preferences?.language)
    ? user.preferences.language
    : DEFAULT_PREFERENCES.language
  const theme = SUPPORTED_THEMES.includes(user?.preferences?.theme)
    ? user.preferences.theme
    : DEFAULT_PREFERENCES.theme
  return { language, theme }
}

export function validatePreferenceUpdate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      error: 'Invalid or missing request body.',
      code: 'INVALID_PREFERENCES_BODY',
    }
  }

  const fields = Object.keys(value)
  const unexpected = fields.filter((field) => !['language', 'theme'].includes(field))
  if (unexpected.length > 0) {
    return {
      error: 'Only language and theme may be updated through this endpoint.',
      code: 'UNEXPECTED_PREFERENCE_FIELD',
      fields: unexpected,
    }
  }
  if (fields.length === 0) {
    return {
      error: 'Provide language or theme to update.',
      code: 'EMPTY_PREFERENCES_UPDATE',
    }
  }
  if ('language' in value && !SUPPORTED_LANGUAGES.includes(value.language)) {
    return {
      error: 'Unsupported language.',
      code: 'UNSUPPORTED_LANGUAGE',
      field: 'language',
    }
  }
  if ('theme' in value && !SUPPORTED_THEMES.includes(value.theme)) {
    return {
      error: 'Unsupported theme.',
      code: 'UNSUPPORTED_THEME',
      field: 'theme',
    }
  }

  return {
    value: {
      ...('language' in value ? { language: value.language } : {}),
      ...('theme' in value ? { theme: value.theme } : {}),
    },
  }
}
