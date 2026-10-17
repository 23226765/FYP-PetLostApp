import { imageError } from '../services/imageErrors.js'

export const IMAGE_LIMITS = Object.freeze({
  inputBytes: 8 * 1024 * 1024,
  pixels: 40_000_000,
  side: 12_000,
  processingSeconds: 10,
  concurrentRequests: 2,
  dailyUploads: 100,
  pendingUploads: 10,
  storedImages: 200,
  uploadLeaseMs: 2 * 60 * 1000,
  uploadHeartbeatMs: 30 * 1000,
  recoveryGraceMs: 5 * 60 * 1000,
  pendingLifetimeMs: 24 * 60 * 60 * 1000,
})

export const IMAGE_PURPOSES = Object.freeze({
  avatar: Object.freeze({ side: 512, bytes: 250 * 1024 }),
  pet: Object.freeze({ side: 1600, bytes: 1024 * 1024 }),
  sighting: Object.freeze({ side: 1600, bytes: 1024 * 1024 }),
  stray: Object.freeze({ side: 1600, bytes: 1024 * 1024 }),
  message: Object.freeze({ side: 1280, bytes: 750 * 1024 }),
})

// Disabled until the managed write flows are explicitly adopted in Phase 2.
export function managedUploadsEnabled(environment = process.env) {
  return environment.IMAGE_UPLOADS_ENABLED === 'true'
}

export function imageStorageConfig(environment = process.env) {
  const provider = environment.IMAGE_STORAGE_PROVIDER || 'cloudinary'
  const namespace = environment.MEDIA_NAMESPACE || 'petlostapp/dev'
  const cloudName = String(environment.CLOUDINARY_CLOUD_NAME || '').trim()
  const apiKey = String(environment.CLOUDINARY_API_KEY || '').trim()
  const apiSecret = String(environment.CLOUDINARY_API_SECRET || '').trim()
  if (
    provider !== 'cloudinary'
    || !/^petlostapp\/(dev|test|prod)$/.test(namespace)
    || !/^[a-z0-9_-]{1,100}$/i.test(cloudName)
    || !/^\d{1,100}$/.test(apiKey)
    || !apiSecret || apiSecret.length > 200
    || /[\s\x00-\x1f]/.test(apiSecret)
    || [cloudName, apiKey, apiSecret].some((value) => /^(your[_-]|placeholder|change[_-]?me)/i.test(value))
  ) throw imageError('IMAGE_STORAGE_CONFIG_INVALID')
  return Object.freeze({ provider, namespace, cloudName, apiKey, apiSecret })
}
