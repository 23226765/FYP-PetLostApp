import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMocks = vi.hoisted(() => ({ updateUserPreferences: vi.fn() }))
vi.mock('../../services/api', () => apiMocks)

import { i18n } from '../../i18n'
import {
  applyAccountPreferences,
  normalizePreferences,
  setPreferences,
  usePreferences,
} from '../usePreferences'

describe('central language and appearance preferences', () => {
  beforeEach(() => {
    localStorage.clear()
    apiMocks.updateUserPreferences.mockReset()
    applyAccountPreferences({ language: 'en', theme: 'light' })
  })

  it('falls back safely for unsupported stored values and missing keys', () => {
    expect(normalizePreferences({ language: 'fr', theme: 'sepia' })).toEqual({
      language: 'en',
      theme: 'light',
    })
    i18n.global.locale.value = 'zh-HK'
    expect(i18n.global.t('common.retry')).toBe('再試一次')
    expect(i18n.global.t('settings.english')).toBe('English')
  })

  it('applies and persists anonymous choices immediately', async () => {
    await setPreferences({ language: 'zh-CN', theme: 'dark' })
    expect(usePreferences().language.value).toBe('zh-CN')
    expect(usePreferences().theme.value).toBe('dark')
    expect(document.documentElement.lang).toBe('zh-CN')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(JSON.parse(localStorage.getItem('pawradar_preferences_v1') || '{}')).toEqual({
      language: 'zh-CN',
      theme: 'dark',
    })
  })

  it('gives authenticated account preferences priority and rolls back failed saves', async () => {
    applyAccountPreferences({ language: 'zh-HK', theme: 'dark' })
    expect(usePreferences().language.value).toBe('zh-HK')
    localStorage.setItem('token', 'test-token')
    apiMocks.updateUserPreferences.mockRejectedValue(new Error('network'))

    await expect(setPreferences({ theme: 'light' })).rejects.toThrow('network')
    expect(usePreferences().theme.value).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('does not translate user-generated values', () => {
    const petName = 'Little Save'
    const userMessage = 'Please meet me near the station.'
    applyAccountPreferences({ language: 'zh-HK', theme: 'light' })
    expect(petName).toBe('Little Save')
    expect(userMessage).toBe('Please meet me near the station.')
  })
})
