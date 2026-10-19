import { IMAGE_ERRORS, imageErrorResponse } from '../services/imageErrors.js'

/** @param {unknown} err */
export function safeErrorMetadata(err) {
  const error = err && typeof err === 'object' ? err : {}
  return {
    name: typeof error.name === 'string' ? error.name : 'Error',
    code:
      typeof error.code === 'string' || typeof error.code === 'number'
        ? error.code
        : undefined,
    status: Number.isInteger(error.status) ? error.status : undefined,
  }
}

export function logServerError(context, err, req) {
  const request = req
    ? {
        method: typeof req.method === 'string' ? req.method : undefined,
        path: typeof req.path === 'string' ? req.path : undefined,
      }
    : undefined
  console.error(context, { ...safeErrorMetadata(err), ...(request ? { request } : {}) })
}

/**
 * Central error boundary. Logs bounded diagnostic metadata server-side while
 * returning stable responses that do not expose request, database, or driver details.
 *
 * @param {unknown} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export function errorHandler(err, req, res, _next) {
  if (Object.hasOwn(IMAGE_ERRORS, err?.code || '')) return imageErrorResponse(err, res, _next)
  if (err?.code === 'SUBMISSION_CONFLICT') return res.status(409).json({ error: 'Submission ID was already used for different content.', code: 'SUBMISSION_CONFLICT' })
  logServerError('Unhandled API error', err, req)

  const error = err && typeof err === 'object' ? err : {}

  if (error.code === 11000 || error.code === '11000' || error.code === 'E11000') {
    return res.status(409).json({ error: 'A record with these details already exists.' })
  }
  if (error.name === 'ValidationError') {
    // Only expose known field names and bounded validation constraints, never
    // Mongoose messages/values (which may contain private submitted data).
    const fields = ['name', 'realName', 'email', 'phone', 'password', 'locationName', 'district', 'description']
    const field = fields.find((name) => error.errors?.[name])
    const detail = field ? error.errors[field] : undefined
    const max = detail?.properties?.maxlength
    const code = !field ? 'INVALID_REQUEST_DATA' : detail?.kind === 'required' ? 'FIELD_REQUIRED'
      : ['maxlength', 'maxLength'].includes(detail?.kind) && Number.isFinite(max) && max >= 0 && max <= 10000 ? 'FIELD_TOO_LONG' : 'FIELD_INVALID'
    return res.status(400).json({ error: 'Invalid request data.', code, ...(field ? { field } : {}), ...(code === 'FIELD_TOO_LONG' ? { params: { max } } : {}) })
  }
  if (error.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid identifier' })
  }

  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500
  const publicMessages = {
    400: 'Invalid request.',
    401: 'Authentication required.',
    403: 'Access denied.',
    404: 'Resource not found.',
    409: 'Request conflict.',
    429: 'Too many requests. Please try again later.',
  }

  res.status(status).json({ error: publicMessages[status] || 'Internal server error' })
}
