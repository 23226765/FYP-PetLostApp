/**
 * Central error boundary. Logs diagnostic details server-side while returning
 * stable messages that do not expose database or driver internals.
 *
 * @param {unknown} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export function errorHandler(err, _req, res, _next) {
  console.error(err)

  const error = err && typeof err === 'object' ? err : {}

  if (error.code === 11000 || error.code === '11000' || error.code === 'E11000') {
    return res.status(409).json({ error: 'A record with these details already exists.' })
  }
  if (error.name === 'ValidationError') {
    return res.status(400).json({ error: 'Invalid request data.' })
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
