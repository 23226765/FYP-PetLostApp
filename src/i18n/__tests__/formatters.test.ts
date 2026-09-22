import { afterEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '..'
import {
  districtLabel,
  formatDateTime,
  formatRelativeDate,
  petStatusLabel,
  speciesLabel,
} from '../formatters'

describe('locale-aware presentation formatters', () => {
  afterEach(() => {
    vi.useRealTimers()
    i18n.global.locale.value = 'en'
  })

  it('translates enum and district labels without changing stored values', () => {
    const stored = { status: 'lost', species: 'Dog', district: 'Central and Western' }
    i18n.global.locale.value = 'zh-HK'

    expect(petStatusLabel(stored.status)).toBe('走失')
    expect(speciesLabel(stored.species)).toBe('狗')
    expect(districtLabel(stored.district)).toBe('中西區')
    expect(stored).toEqual({
      status: 'lost',
      species: 'Dog',
      district: 'Central and Western',
    })
  })

  it('formats relative counts and dates using the active locale', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-19T12:00:00.000Z'))
    i18n.global.locale.value = 'zh-CN'

    expect(formatRelativeDate('2026-09-19T11:55:00.000Z')).toBe('5 分钟前')
    expect(formatDateTime('2026-01-02T03:04:00.000Z')).toContain('2026')
  })
})
