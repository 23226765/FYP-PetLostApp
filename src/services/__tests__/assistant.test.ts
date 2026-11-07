import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { askAssistant, assistantStatus } from '../assistant'
import { setSessionToken, invalidateAuthContext } from '../authSession'
const payload = { text: 'Hello', locale: 'en' as const, history: [], consent: true }
const replies = vi.fn()
beforeEach(() => { localStorage.clear(); invalidateAuthContext(); vi.stubGlobal('fetch', replies); replies.mockReset() })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it('uses anonymous, redirect-rejecting transport and sends no token, user or page data', async () => {
  setSessionToken('synthetic-token')
  replies.mockResolvedValue(Response.json({ mode: 'ai', text: 'Hello there' }))
  expect(await askAssistant(payload, new AbortController().signal)).toEqual({ mode: 'ai', text: 'Hello there', topicId: undefined })
  const [url, options] = replies.mock.calls[0]
  expect(url).toBe('/api/assistant/chat')
  expect(options.credentials).toBe('omit'); expect(options.redirect).toBe('error')
  expect(options.headers).toEqual({ 'Content-Type': 'application/json' })
  expect(JSON.parse(options.body)).toEqual(payload)
})
it.each([401, 403, 429, 500])('provider/app HTTP %s cannot sign out the current account or reveal raw bodies', async status => {
  setSessionToken('synthetic-session')
  const event = vi.fn(); window.addEventListener('auth:unauthorized', event)
  replies.mockResolvedValue(Response.json({ code: 'RAW_SECRET', message: 'synthetic-private-content' }, { status }))
  await expect(askAssistant(payload, new AbortController().signal)).rejects.toMatchObject({ code: 'ASSISTANT_UNAVAILABLE' })
  expect(localStorage.getItem('token')).toBe('synthetic-session'); expect(event).not.toHaveBeenCalled()
  window.removeEventListener('auth:unauthorized', event)
})
it.each(['success', 'failure'])('pins operation to initiating context across same-tick switches: %s', async outcome => {
  let resolve!: (response: Response) => void, reject!: (reason: unknown) => void
  replies.mockReturnValue(new Promise<Response>((yes, no) => { resolve = yes; reject = no }))
  setSessionToken('synthetic-a')
  const request = askAssistant(payload, new AbortController().signal)
  setSessionToken('synthetic-b')
  if (outcome === 'success') resolve(Response.json({ mode: 'ai', text: 'Old answer' }))
  else reject(new Error('old network failure'))
  await expect(request).rejects.toMatchObject({ apiCode: 'AUTH_CONTEXT_CHANGED' })
  expect(localStorage.getItem('token')).toBe('synthetic-b')
})
it('times out and respects explicit cancellation without automatic retry', async () => {
  vi.useFakeTimers()
  replies.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })))
  const pending = askAssistant(payload, new AbortController().signal)
  const expectation = expect(pending).rejects.toMatchObject({ code: 'ASSISTANT_TIMEOUT' })
  await vi.advanceTimersByTimeAsync(25_000); await expectation
  expect(replies).toHaveBeenCalledTimes(1)
  const controller = new AbortController(); const cancelled = askAssistant(payload, controller.signal); controller.abort()
  await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' })
})
it('status and malformed responses disclose only the narrow interface', async () => {
  replies.mockResolvedValueOnce(Response.json({ enabled: false }))
  expect(await assistantStatus(new AbortController().signal)).toBe(false)
  replies.mockResolvedValueOnce(Response.json({ mode: 'tools', text: 'not allowed' }))
  await expect(askAssistant(payload, new AbortController().signal)).rejects.toMatchObject({ code: 'ASSISTANT_UNAVAILABLE' })
})
