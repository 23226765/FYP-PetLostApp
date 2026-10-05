import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { fileTypeFromBuffer } from 'file-type'
import { IMAGE_LIMITS, IMAGE_PURPOSES } from '../config/imageStorage.js'
import { imageError } from './imageErrors.js'

const INPUT_FORMATS = new Map([
  ['image/jpeg', 'jpeg'], ['image/png', 'png'], ['image/webp', 'webp'],
])

export async function processImage(input, purpose) {
  const policy = Object.hasOwn(IMAGE_PURPOSES, purpose) ? IMAGE_PURPOSES[purpose] : null
  if (!policy) throw imageError('IMAGE_PURPOSE_INVALID')
  if (!Buffer.isBuffer(input) || !input.length) throw imageError('IMAGE_INVALID')
  if (input.length > IMAGE_LIMITS.inputBytes) throw imageError('IMAGE_TOO_LARGE')
  try {
    const detected = await fileTypeFromBuffer(input)
    const expectedFormat = INPUT_FORMATS.get(detected?.mime)
    if (!expectedFormat) throw imageError('IMAGE_INVALID')
    const options = { failOn: 'warning', limitInputPixels: IMAGE_LIMITS.pixels }
    const metadata = await sharp(input, options).metadata()
    if (
      metadata.format !== expectedFormat || (metadata.pages || 1) !== 1
      || !metadata.width || !metadata.height
    ) throw imageError('IMAGE_INVALID')
    if (
      metadata.width > IMAGE_LIMITS.side || metadata.height > IMAGE_LIMITS.side
      || metadata.width * metadata.height > IMAGE_LIMITS.pixels
    ) throw imageError('IMAGE_TOO_LARGE')

    // Re-encoding discards trailing payloads and strips EXIF/ICC/XMP/IPTC.
    // Never call keepMetadata(), keepExif(), or withMetadata() on this pipeline.
    for (const quality of [80, 65, 50, 40]) {
      const { data, info } = await sharp(input, options)
        .rotate()
        .resize({ width: policy.side, height: policy.side, fit: 'inside', withoutEnlargement: true })
        .toColourspace('srgb')
        .webp({ quality, effort: 4 })
        .timeout({ seconds: IMAGE_LIMITS.processingSeconds })
        .toBuffer({ resolveWithObject: true })
      if (data.length <= policy.bytes) {
        return {
          buffer: data, width: info.width, height: info.height, format: 'webp',
          bytes: data.length, checksum: createHash('sha256').update(data).digest('hex'),
        }
      }
    }
    throw imageError('IMAGE_OUTPUT_TOO_LARGE')
  } catch (error) {
    if (error?.code?.startsWith('IMAGE_')) throw error
    if (/pixel limit/i.test(String(error?.message))) throw imageError('IMAGE_TOO_LARGE')
    throw imageError('IMAGE_INVALID')
  }
}
