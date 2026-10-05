// Opt-in provider-only probe. Does not import Mongoose, connect to MongoDB,
// create application records, run migration, or run abandoned-upload cleanup.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID, createHash } from 'node:crypto'
import dotenv from 'dotenv'
import sharp from 'sharp'
import { createImageStorage } from '../services/storage/index.js'
import { processImage } from '../services/imageProcessing.js'

if (!process.argv.includes('--confirm-temporary-cloudinary-write')) {
  console.error('No action taken. This probe requires explicit temporary upload/delete approval.')
  process.exitCode = 1
} else {
  dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') })
  let storage, asset, attempted = false, verified = false
  try {
    // Isolate from production namespaces, regardless of local upload flags.
    storage = createImageStorage({ ...process.env, MEDIA_NAMESPACE: 'petlostapp/test' })
    asset = { provider: storage.provider, publicId: storage.publicIdFor('avatar', randomUUID()) }
    console.log(`Temporary Cloudinary object: ${asset.publicId}`)
    const source = await sharp({ create: { width: 96, height: 64, channels: 3, background: '#1d6360' } }).png().toBuffer()
    const processed = await processImage(source, 'avatar')
    attempted = true
    const uploaded = await storage.uploadImage(processed.buffer, asset)
    const found = await storage.stat(asset)
    if (!found || found.providerAssetId !== uploaded.providerAssetId || found.bytes !== processed.bytes) {
      throw Object.assign(new Error('Verification failed'), { code: 'IMAGE_METADATA_MISMATCH' })
    }
    const stream = await storage.openReadStream(asset)
    const reader = stream.getReader(), hash = createHash('sha256')
    let bytes = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > processed.bytes) throw Object.assign(new Error('Verification failed'), { code: 'IMAGE_DELIVERY_SIZE_MISMATCH' })
        hash.update(value)
      }
    } finally { await reader.cancel().catch(() => undefined) }
    if (hash.digest('hex') !== processed.checksum) throw Object.assign(new Error('Verification failed'), { code: 'IMAGE_DELIVERY_HASH_MISMATCH' })
    verified = true
    console.log(`Upload, metadata and signed backend delivery verified (${uploaded.width}x${uploaded.height} WebP; ${bytes} bytes).`)
  } catch (error) {
    console.error(`Provider verification failed (${/^IMAGE_[A-Z_]+$/.test(error?.code || '') ? error.code : 'IMAGE_STORAGE_UNAVAILABLE'}).`)
    process.exitCode = 1
  } finally {
    if (attempted && storage && asset) {
      try {
        await storage.deleteImage(asset)
        if (await storage.stat(asset) !== null) throw new Error('Deletion not confirmed')
        console.log(`Deletion confirmed: ${asset.publicId} is absent.`)
      } catch {
        console.error(`Deletion could not be confirmed for exact temporary object: ${asset.publicId}`)
        process.exitCode = 1
      }
    }
    console.log(`MongoDB accessed: no. Application records changed: no. Provider probe passed: ${verified && !process.exitCode ? 'yes' : 'no'}.`)
  }
}
