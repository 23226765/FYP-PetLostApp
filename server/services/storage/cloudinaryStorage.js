import { v2 as cloudinary } from 'cloudinary'
import { imageError } from '../imageErrors.js'

const CATEGORY = { avatar: 'avatars', pet: 'pets', sighting: 'sightings', stray: 'strays', message: 'messages' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createCloudinaryStorage(config, sdk = cloudinary, fetchImpl = fetch) {
  // Pass configuration per call; avoid mutating the SDK's global singleton.
  const credentials = {
    cloud_name: config.cloudName, api_key: config.apiKey, api_secret: config.apiSecret,
    secure: true, timeout: 30_000,
  }
  function assertAsset(asset) {
    const publicId = asset?.publicId
    const prefix = `${config.namespace}/`
    const segments = typeof publicId === 'string' && publicId.startsWith(prefix)
      ? publicId.slice(prefix.length).split('/') : []
    if (
      asset?.provider !== 'cloudinary' || segments.length !== 2
      || !Object.values(CATEGORY).includes(segments[0]) || !UUID.test(segments[1])
    ) throw imageError('IMAGE_REQUEST_INVALID')
    return publicId
  }
  function options(asset) {
    return { ...credentials, resource_type: 'image', type: 'authenticated', public_id: assertAsset(asset) }
  }
  function metadata(result, asset) {
    if (
      result?.public_id !== asset.publicId || result?.type !== 'authenticated'
      || result?.resource_type !== 'image' || result?.format !== 'webp'
      || !Number.isInteger(result.width) || result.width < 1
      || !Number.isInteger(result.height) || result.height < 1
      || !Number.isInteger(result.bytes) || result.bytes < 1
      || typeof result.asset_id !== 'string'
    ) throw imageError('IMAGE_STORAGE_UNAVAILABLE')
    let url
    try { url = new URL(result.secure_url) } catch { throw imageError('IMAGE_STORAGE_UNAVAILABLE') }
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || url.username || url.password || url.search || url.hash) {
      throw imageError('IMAGE_STORAGE_UNAVAILABLE')
    }
    return {
      provider: 'cloudinary', publicId: result.public_id, providerAssetId: result.asset_id,
      secureUrl: url.href, width: result.width, height: result.height,
      format: result.format, bytes: result.bytes,
    }
  }
  return Object.freeze({
    provider: 'cloudinary',
    publicIdFor(purpose, uuid) {
      if (!Object.hasOwn(CATEGORY, purpose) || !UUID.test(uuid)) throw imageError('IMAGE_REQUEST_INVALID')
      return `${config.namespace}/${CATEGORY[purpose]}/${uuid}`
    },
    async uploadImage(buffer, asset) {
      const uploadOptions = { ...options(asset), overwrite: false, unique_filename: false, use_filename: false }
      if (!Buffer.isBuffer(buffer) || !buffer.length) throw imageError('IMAGE_INVALID')
      try {
        const result = await new Promise((resolve, reject) => {
          const stream = sdk.uploader.upload_stream(uploadOptions, (error, value) => error ? reject(error) : resolve(value))
          stream.on('error', reject)
          stream.end(buffer)
        })
        // An exceptionally unlikely UUID collision must never delete somebody
        // else's pre-existing object during compensation.
        if (result.existing) throw imageError('IMAGE_STORAGE_CONFLICT')
        return metadata(result, asset)
      } catch (error) {
        if (error?.code === 'IMAGE_STORAGE_CONFLICT') throw imageError('IMAGE_STORAGE_CONFLICT')
        throw imageError('IMAGE_STORAGE_UNAVAILABLE')
      }
    },
    async stat(asset) {
      const opts = options(asset)
      try {
        return metadata(await sdk.api.resource(asset.publicId, opts), asset)
      } catch (error) {
        if (error?.http_code === 404 || error?.error?.http_code === 404) return null
        throw imageError('IMAGE_STORAGE_UNAVAILABLE')
      }
    },
    async deleteImage(asset) {
      const opts = options(asset)
      try {
        const result = await sdk.uploader.destroy(asset.publicId, { ...opts, invalidate: true })
        if (!['ok', 'not found'].includes(result?.result)) throw imageError('IMAGE_STORAGE_UNAVAILABLE')
        return { deleted: true }
      } catch { throw imageError('IMAGE_STORAGE_UNAVAILABLE') }
    },
    async openReadStream(asset) {
      assertAsset(asset)
      try {
        const url = sdk.url(asset.publicId, { ...options(asset), sign_url: true, format: 'webp' })
        // The signature is server-only; do not return/redirect to this URL.
        const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) })
        if (!response.ok || !response.body || !response.headers.get('content-type')?.startsWith('image/webp')) {
          throw imageError('IMAGE_STORAGE_UNAVAILABLE')
        }
        return response.body
      } catch { throw imageError('IMAGE_STORAGE_UNAVAILABLE') }
    },
  })
}
