import multer from 'multer'
import { IMAGE_LIMITS, managedUploadsEnabled } from '../config/imageStorage.js'
import { imageError, imageErrorResponse } from '../services/imageErrors.js'

export function requireManagedUploads(_req, res, next) {
  if (!managedUploadsEnabled()) return imageErrorResponse(imageError('IMAGE_UPLOADS_DISABLED'), res, next)
  return next()
}

export function createImageUploadSlots() {
  let active = 0
  const users = new Set()
  return function imageUploadSlot(req, res, next) {
    const userId = String(req.user._id)
    if (users.has(userId)) return imageErrorResponse(imageError('IMAGE_UPLOAD_IN_PROGRESS'), res, next)
    if (active >= IMAGE_LIMITS.concurrentRequests) return imageErrorResponse(imageError('IMAGE_PROCESSING_BUSY'), res, next)
    active += 1
    users.add(userId)
    // Hold the slot through processing/provider I/O, even if the browser closes.
    let released = false
    req.releaseImageUploadSlot = () => {
      if (released) return
      released = true
      active -= 1
      users.delete(userId)
    }
    // A disconnect during multipart parsing may occur before Multer calls back.
    // Processing/provider I/O retains the slot until its controller's finally.
    const releaseParsingSlot = () => {
      if (!req.managedImageProcessing) req.releaseImageUploadSlot()
    }
    req.once?.('aborted', releaseParsingSlot)
    res.once?.('close', releaseParsingSlot)
    next()
  }
}

export const imageUploadSlot = createImageUploadSlots()
const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_LIMITS.inputBytes, files: 1, fields: 2, fieldSize: 100, parts: 3, fieldNameSize: 32 },
}).single('image')

export function parseManagedImage(req, res, next) {
  if (!req.is('multipart/form-data')) {
    req.releaseImageUploadSlot?.()
    return imageErrorResponse(imageError('IMAGE_REQUEST_INVALID'), res, next)
  }
  req.setTimeout(30_000, () => req.destroy())
  parser(req, res, (error) => {
    req.setTimeout(0)
    if (!error) return next()
    req.releaseImageUploadSlot?.()
    const code = error.code === 'LIMIT_FILE_SIZE' ? 'IMAGE_TOO_LARGE' : 'IMAGE_REQUEST_INVALID'
    return imageErrorResponse(imageError(code), res, next)
  })
}
