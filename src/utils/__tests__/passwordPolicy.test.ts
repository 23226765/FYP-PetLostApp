import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { MAX_PASSWORD_BYTES, passwordByteLength } from '../passwordPolicy'

describe('UTF-8 password byte counting', () => {
  it.each([false, true])('matches UTF-8 with TextEncoder unavailable: %s', (withoutEncoder) => {
    if (withoutEncoder) vi.stubGlobal('TextEncoder', undefined)
    try {
      for (const value of ['', 'a'.repeat(71), 'a'.repeat(72), 'a'.repeat(73), '虎'.repeat(24), '虎'.repeat(24) + 'a', '🐾'.repeat(18), '🐾'.repeat(18) + 'a', 'a'.repeat(70) + '虎', 'e\u0301', '\ud800', '\udfff', '  unchanged  ']) {
        expect(passwordByteLength(value)).toBe(Buffer.byteLength(value, 'utf8'))
      }
      expect(MAX_PASSWORD_BYTES).toBe(72)
    } finally { vi.unstubAllGlobals() }
  })
})
