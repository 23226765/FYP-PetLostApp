import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const uploadsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads')
const MIME_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])
const MAX_BYTES = 5 * 1024 * 1024

export async function uploadImage(req, res, next) {
  try {
    const value = typeof req.body?.dataUrl === 'string' ? req.body.dataUrl : ''
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value)
    if (!match || !MIME_TYPES.has(match[1])) {
      return res.status(400).json({ error: 'A JPEG, PNG, or WebP image is required.' })
    }
    const bytes = Buffer.from(match[2], 'base64')
    if (!bytes.length || bytes.length > MAX_BYTES) {
      return res.status(413).json({ error: 'Image must be smaller than 5 MB.' })
    }
    await mkdir(uploadsDirectory, { recursive: true })
    const filename = `${randomUUID()}.${MIME_TYPES.get(match[1])}`
    await writeFile(path.join(uploadsDirectory, filename), bytes, { flag: 'wx' })
    res.status(201).json({ url: `/uploads/${filename}` })
  } catch (error) { next(error) }
}
