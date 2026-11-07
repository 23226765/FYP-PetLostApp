import express from 'express'
import { createRateLimiter } from '../middleware/rateLimit.js'
import { AssistantError, assistantConfig, createCloudflareProvider } from '../services/assistantProvider.js'
import { ASSISTANT_LIMITS, findReviewedHelp } from '../../shared/assistantGuidance.js'

function validateBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !['text', 'locale', 'history', 'consent'].includes(key))
    || !['en', 'zh-HK', 'zh-CN'].includes(body.locale)
    || typeof body.text !== 'string' || !body.text.trim() || body.text.length > ASSISTANT_LIMITS.text
    || !Array.isArray(body.history) || body.history.length > ASSISTANT_LIMITS.history
    || body.history.length % 2 !== 0 || typeof body.consent !== 'boolean') return null
  let length = 0
  for (let i = 0; i < body.history.length; i++) {
    const turn = body.history[i]
    if (!turn || typeof turn !== 'object' || Array.isArray(turn)
      || Object.keys(turn).some(key => !['role', 'content'].includes(key))
      || turn.role !== (i % 2 === 0 ? 'user' : 'assistant')
      || typeof turn.content !== 'string' || !turn.content.trim()
      || turn.content.length > (turn.role === 'user' ? ASSISTANT_LIMITS.text : ASSISTANT_LIMITS.answer)) return null
    length += turn.content.length
  }
  if (length > ASSISTANT_LIMITS.context) return null
  return { text: body.text.trim(), locale: body.locale, history: body.history }
}

// Factory dependencies are used only by isolated tests; never supplied by HTTP clients.
export function createAssistantRouter({ provider = createCloudflareProvider(), environment = () => process.env, concurrency = 2, now = () => Date.now(), ipLimit = 6, dailyLimit = 100 } = {}) {
  const router = express.Router()
  let running = 0
  const ipLimiter = createRateLimiter({ windowMs: 60_000, maxBuckets: 1000, now, limits: [{ name: 'assistant-ip', limit: ipLimit, key: req => req.ip || req.socket?.remoteAddress || 'unknown' }] })
  const globalLimiter = createRateLimiter({ windowMs: 86_400_000, now, limits: [{ name: 'assistant-global', limit: dailyLimit, key: () => 'all' }] })
  router.use((_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next() })
  router.get('/status', (_req, res) => res.json({ enabled: assistantConfig(environment()).enabled }))
  // Mounted before the app's 10MB parsers. Inflation is intentionally disabled.
  router.post('/chat', ipLimiter, express.json({ limit: '32kb', strict: true, inflate: false }), (req, res, next) => {
    if (!req.is('application/json')) return res.status(415).json({ code: 'ASSISTANT_INVALID_REQUEST' })
    const input = validateBody(req.body)
    if (!input) return res.status(400).json({ code: 'ASSISTANT_INVALID_REQUEST' })
    const help = findReviewedHelp(input.text, input.locale)
    if (help) return res.json({ mode: 'reviewed', topicId: help.id, text: help.answer })
    if (!assistantConfig(environment()).enabled) return res.status(503).json({ code: 'ASSISTANT_DISABLED' })
    if (req.body.consent !== true) return res.status(400).json({ code: 'ASSISTANT_CONSENT_REQUIRED' })
    return globalLimiter(req, res, () => next())
  }, async (req, res) => {
    if (running >= concurrency) return res.status(429).set('Retry-After', '5').json({ code: 'ASSISTANT_BUSY' })
    const controller = new AbortController()
    const abort = () => { if (!res.writableEnded) controller.abort() }
    req.once('aborted', abort)
    res.once('close', abort)
    running++
    try {
      const answer = await provider(validateBody(req.body), { signal: controller.signal })
      if (!controller.signal.aborted && !res.destroyed) res.json({ mode: 'ai', text: answer })
    } catch (error) {
      if (!res.destroyed && !controller.signal.aborted) {
        // Only our own fixed error vocabulary can cross the boundary. Never log errors.
        const safe = error instanceof AssistantError ? error : new AssistantError('ASSISTANT_UNAVAILABLE')
        if (safe.retryAfter) res.set('Retry-After', String(safe.retryAfter))
        res.status(safe.status).json({ code: safe.code })
      }
    } finally {
      running--
      req.removeListener('aborted', abort)
      res.removeListener('close', abort)
    }
  })
  router.use((_req, res) => res.status(404).json({ code: 'ASSISTANT_NOT_FOUND' }))
  router.use((error, _req, res, _next) => {
    res.status(error?.type === 'entity.too.large' ? 413 : error?.status === 415 ? 415 : 400).json({ code: 'ASSISTANT_INVALID_REQUEST' })
  })
  return router
}

export default createAssistantRouter()
