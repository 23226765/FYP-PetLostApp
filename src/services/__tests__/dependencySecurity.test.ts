import { describe, it, expect, vi } from 'vitest'
import axios from 'axios'
import { ssrRenderAttrs } from '@vue/server-renderer'

describe('patched dependency security boundaries', () => {
  it('Axios default requests cannot inherit a polluted Object.prototype HTTP method', async () => {
    // Real Axios merging/dispatch, isolated adapter: no network/provider writes.
    const client = axios.create({ adapter: async (config) => ({ config, status: 200, statusText: 'OK', headers: {}, data: {} }) })
    const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'method')
    Object.defineProperty(Object.prototype, 'method', { value: 'delete', writable: true, configurable: true })
    try {
      const result = await client.request({ url: '/synthetic-security-probe' })
      expect(result.config.method).toBe('get')
    } finally {
      if (previous) Object.defineProperty(Object.prototype, 'method', previous)
      else Reflect.deleteProperty(Object.prototype, 'method')
    }
  })

  it('Vue SSR rejects carriage returns in dynamic attribute names', () => {
    // The deployed app is client-rendered; this verifies the patched dormant
    // SSR dependency used by Vue/test-utils without adding an SSR application.
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      expect(ssrRenderAttrs({ 'title\ronclick': 'synthetic' })).not.toContain('onclick')
      expect(ssrRenderAttrs({ title: 'safe' })).toBe(' title="safe"')
    } finally { warning.mockRestore() }
  })
})
