export const IMAGE_ERRORS = Object.freeze({
  IMAGE_IDS_REQUIRED: [400, 'Upload the image first and submit its image ID.'],
  IMAGE_ATTACHMENT_FORBIDDEN: [403, 'This image cannot be attached to this content.'],
  IMAGE_UPLOADS_DISABLED: [503, 'Managed image uploads are not enabled.'],
  IMAGE_STORAGE_CONFIG_INVALID: [503, 'Image storage is not configured.'],
  IMAGE_STORAGE_UNAVAILABLE: [503, 'Image storage is temporarily unavailable.'],
  IMAGE_STORAGE_CONFLICT: [503, 'The image could not be stored safely. Please retry with a new upload identifier.'],
  IMAGE_INVALID: [400, 'Choose a valid JPEG, PNG, or static WebP image.'],
  IMAGE_TOO_LARGE: [413, 'The image exceeds the permitted size or dimensions.'],
  IMAGE_OUTPUT_TOO_LARGE: [413, 'The image could not be compressed within the permitted size.'],
  IMAGE_PURPOSE_INVALID: [400, 'Choose a valid image purpose.'],
  IMAGE_REQUEST_INVALID: [400, 'Invalid image upload request.'],
  IMAGE_UPLOAD_IN_PROGRESS: [409, 'An image upload is already in progress.'],
  IMAGE_UPLOAD_RETRY_REQUIRED: [409, 'The previous image reservation has ended. Retry with a new upload identifier.'],
  IMAGE_IDEMPOTENCY_CONFLICT: [409, 'This upload identifier belongs to a different image.'],
  IMAGE_UPLOAD_QUOTA: [429, 'The image upload allowance has been reached.'],
  IMAGE_PROCESSING_BUSY: [503, 'Image processing is busy. Please retry shortly.'],
  IMAGE_DATABASE_UNAVAILABLE: [503, 'Image metadata could not be saved. Please retry later.'],
  IMAGE_NOT_FOUND: [404, 'Image not found.'],
})

export function imageError(code) {
  const [status, message] = IMAGE_ERRORS[code] || IMAGE_ERRORS.IMAGE_STORAGE_UNAVAILABLE
  return Object.assign(new Error(message), { code, status })
}

export function imageErrorResponse(error, res, next) {
  const known = IMAGE_ERRORS[error?.code]
  if (!known) return next(error)
  if (known[0] === 503) res.set('Retry-After', '5')
  if (known[0] === 429) res.set('Retry-After', '900')
  return res.status(known[0]).json({ success: false, code: error.code, error: known[1] })
}
