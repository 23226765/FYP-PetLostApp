export function errorHandler(err, _req, res, _next) {
  console.error(err)

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message })
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid identifier' })
  }
  const status = err.status || 500
  res.status(status).json({ error: err.message || 'Internal server error' })
}