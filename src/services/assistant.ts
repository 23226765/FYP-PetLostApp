import { captureAuthContext, isAuthContextCurrent, authContextError } from './authSession'
import { ASSISTANT_LIMITS, type AssistantLocale } from '../../shared/assistantGuidance.js'

export interface AssistantTurn { role: 'user' | 'assistant'; content: string }
export interface AssistantRequest { text: string; locale: AssistantLocale; history: AssistantTurn[]; consent: boolean }
export interface AssistantReply { mode: 'ai' | 'reviewed'; text: string; topicId?: string }
export class AssistantRequestError extends Error {
  constructor(public code: string) { super(code) }
}

const errors = new Set(['ASSISTANT_DISABLED', 'ASSISTANT_QUOTA', 'ASSISTANT_BUSY', 'ASSISTANT_TIMEOUT', 'ASSISTANT_CONSENT_REQUIRED', 'ASSISTANT_INVALID_REQUEST', 'RATE_LIMITED'])

async function request(path: 'chat' | 'status', payload: AssistantRequest | undefined, signal: AbortSignal) {
  // This context is local only. Never use the authenticated API client or send tokens.
  const context = captureAuthContext()
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, 25_000)
  try {
    if (!isAuthContextCurrent(context)) throw authContextError()
    const base = String(import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
    const response = await fetch(`${base}/assistant/${path}`, {
      method: payload ? 'POST' : 'GET', credentials: 'omit', redirect: 'error', signal: controller.signal,
      headers: payload ? { 'Content-Type': 'application/json' } : {},
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    })
    const data: unknown = await response.json()
    if (!isAuthContextCurrent(context)) throw authContextError()
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
    if (!response.ok) {
      const code = data && typeof data === 'object' && 'code' in data ? String(data.code) : ''
      throw new AssistantRequestError(errors.has(code) ? code : 'ASSISTANT_UNAVAILABLE')
    }
    return data
  } catch (error) {
    if (!isAuthContextCurrent(context)) throw authContextError()
    if (timedOut) throw new AssistantRequestError('ASSISTANT_TIMEOUT')
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    if (error instanceof AssistantRequestError) throw error
    throw new AssistantRequestError('ASSISTANT_UNAVAILABLE')
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

export async function assistantStatus(signal: AbortSignal): Promise<boolean> {
  const data = await request('status', undefined, signal)
  return Boolean(data && typeof data === 'object' && 'enabled' in data && data.enabled === true)
}

export async function askAssistant(payload: AssistantRequest, signal: AbortSignal): Promise<AssistantReply> {
  const data = await request('chat', payload, signal)
  if (!data || typeof data !== 'object' || !('text' in data) || typeof data.text !== 'string' || !data.text.trim()
    || data.text.length > ASSISTANT_LIMITS.answer || !('mode' in data) || !['ai', 'reviewed'].includes(String(data.mode))) {
    throw new AssistantRequestError('ASSISTANT_UNAVAILABLE')
  }
  return { mode: data.mode as AssistantReply['mode'], text: data.text, topicId: 'topicId' in data && typeof data.topicId === 'string' ? data.topicId : undefined }
}
