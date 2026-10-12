import { Router } from 'express'
import { optionalAuth } from '../middleware/auth.js'
import { normalizeLegacyPath, readLegacyImage } from '../services/legacyImageAccess.js'

export function createLegacyImagesRouter(dependencies) {
  const router = Router()
  router.use((req, res, next) => {
    res.set('Cache-Control', 'private, no-store, max-age=0')
    res.set('Pragma', 'no-cache')
    res.set('Expires', '0')
    res.vary('Authorization')
    res.set('X-Content-Type-Options', 'nosniff')
    try {
      // Express can consume a trailing mount slash. Validate the original
      // suffix so a double separator cannot silently become a valid path.
      const prefix = req.baseUrl.replace(/\/+$/, '')
      req.legacyImageKey = normalizeLegacyPath(req.originalUrl.slice(prefix.length))
    } catch (error) { return next(error) }
    if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end()
    next()
  }, optionalAuth, async (req, res, next) => {
    try {
      const image = await readLegacyImage(req.legacyImageKey, req.user, dependencies)
      res.set('Content-Type', image.contentType)
      res.set('Content-Disposition', 'inline')
      res.set('Content-Length', String(image.buffer.length))
      // No ETag, Last-Modified, 304 or public cache reuse. Every request is
      // authorized, including HEAD and requests carrying old cache validators.
      res.end(req.method === 'HEAD' ? undefined : image.buffer)
    } catch (error) { next(error) }
  })
  router.use((error, _req, res, next) => {
    if (error?.code !== 'IMAGE_NOT_FOUND' || res.headersSent) return next(error)
    // Express json()/send() otherwise generates an ETag even for a denied
    // image. Keep unavailable responses free of cache validators as well.
    res.status(404).set('Content-Type', 'application/json')
    res.end(JSON.stringify({ success: false, code: 'IMAGE_NOT_FOUND', error: 'Image not found.' }))
  })
  return router
}

export default createLegacyImagesRouter()
