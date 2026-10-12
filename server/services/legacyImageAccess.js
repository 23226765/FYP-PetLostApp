import path from 'node:path'
import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { fileTypeFromBuffer } from 'file-type'
import { mediaModels, authorizeMediaDestination } from './mediaAccess.js'
import { imageError } from './imageErrors.js'
import { DEVELOPMENT_CORS_ORIGINS } from '../config/httpSecurity.js'

export const LEGACY_UPLOAD_ROOT = fileURLToPath(new URL('../uploads/', import.meta.url))
const MAX_FILE_BYTES = 16 * 1024 * 1024
const MAX_REFERENCES = 100
const IMAGE_FIELDS = { user: ['avatar'], pet: ['photo', 'photos'], sighting: ['photo'], stray: ['photo', 'photos'], message: ['photo'] }
const RASTER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
const unavailable = () => imageError('IMAGE_NOT_FOUND')

/** Decode once, without URL dot-segment normalization. Ambiguous forms fail closed. */
export function normalizeLegacyPath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length > 1024 || !relativePath.startsWith('/') || /[?#\\]/.test(relativePath)) throw unavailable()
  let parts
  try { parts = relativePath.slice(1).split('/').map((part) => decodeURIComponent(part)) }
  catch { throw unavailable() }
  if (!parts.length || parts.some((part) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(part) || part.endsWith('.'))) throw unavailable()
  return parts.join('/')
}

function trustedOrigins() {
  const origins = new Set(DEVELOPMENT_CORS_ORIGINS)
  const port = Number(process.env.PORT) || 5000
  origins.add(`http://localhost:${port}`); origins.add(`http://127.0.0.1:${port}`)
  for (const candidate of String(process.env.CORS_ORIGINS || '').split(',')) {
    try { origins.add(new URL(candidate.trim()).origin) } catch { /* Startup validates this setting separately. */ }
  }
  return origins
}

function referencePath(value, origins) {
  if (typeof value !== 'string') throw unavailable()
  const match = value.match(/^(?:(https?:\/\/[^/?#]+|\/\/[^/?#]+))?\/?uploads(\/[^?#]*)(?:[?#].*)?$/i)
  if (!match) throw unavailable()
  let local = !match[1]
  if (match[1]) {
    const origin = new URL(match[1], 'https://legacy.invalid')
    if (origin.username || origin.password) throw unavailable()
    local = origins.has(origin.origin) || ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
  }
  return { key: normalizeLegacyPath(match[2]), local }
}

const samePath = (left, right) => process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Query by basename, then validate complete paths in memory. This deliberately
// includes hidden/inactive records, encoded aliases and potentially ambiguous
// references: filtering them out first would let a public copy bypass policy.
export function legacyReferencePattern(key) {
  const basename = key.split('/').at(-1)
  const encodedName = [...basename].map((character) => {
    const hex = character.charCodeAt(0).toString(16).padStart(2, '0')
    return `(?:${escaped(character)}|%${hex})`
  }).join('')
  // Include suspicious suffix aliases too (Windows trailing dots/ADS, etc.).
  // They are rejected during normalization, not ignored as if harmless copies.
  return new RegExp(`^(?:https?:\\/\\/[^/?#]+|\\/\\/[^/?#]+)?\\/?uploads(?:/|\\\\|%2f)[^?#]*${encodedName}[^/?#]*(?:[?#].*)?$`, 'i')
}

export async function authorizeLegacyImage(key, user, {
  models = mediaModels, authorize = authorizeMediaDestination, origins = trustedOrigins(),
} = {}) {
  const pattern = legacyReferencePattern(key)
  const references = []
  let established = false
  for (const [type, fields] of Object.entries(IMAGE_FIELDS)) {
    const Model = models[type]
    if (!Model) throw unavailable()
    const rows = await Model.find({ $or: fields.map((field) => ({ [field]: pattern })) })
      .select(`_id ${fields.join(' ')}`).limit(MAX_REFERENCES + 1).lean()
    if (rows.length > MAX_REFERENCES) throw unavailable()
    for (const doc of rows) {
      let matched = false
      for (const field of fields) {
        const values = Array.isArray(doc[field]) ? doc[field] : [doc[field]]
        for (const value of values) {
          if (typeof value !== 'string' || !pattern.test(value)) continue
          // An ambiguous stored alias cannot safely be ignored in favour of a
          // public record. Deny instead of assuming it points somewhere else.
          const reference = referencePath(value, origins)
          if (!samePath(reference.key, key)) continue
          established ||= reference.local
          matched = true
        }
      }
      if (matched) references.push({ type, id: doc._id })
    }
  }
  if (!established || !references.length || references.length > MAX_REFERENCES) throw unavailable()
  for (const reference of references) {
    // The same policy as managed images, including visible parents, private
    // owner/reporter access, chat membership and mutual blocking. No admin bypass.
    const doc = await authorize(reference.type, reference.id, user, { models })
    const values = IMAGE_FIELDS[reference.type].flatMap((field) => Array.isArray(doc[field]) ? doc[field] : [doc[field]])
    if (!values.some((value) => {
      try { return samePath(referencePath(value, origins).key, key) } catch { return false }
    })) throw unavailable()
  }
}

function inside(root, target) {
  const relative = path.relative(root, target)
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

async function inspectFile(root, key) {
  const rootStat = await fs.lstat(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw unavailable()
  const realRoot = await fs.realpath(root)
  const filename = path.resolve(root, ...key.split('/'))
  if (!inside(root, filename)) throw unavailable()
  let current = root, stat
  const parts = key.split('/')
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]); stat = await fs.lstat(current)
    if (stat.isSymbolicLink() || (index < parts.length - 1 && !stat.isDirectory())) throw unavailable()
  }
  if (!stat.isFile() || stat.nlink !== 1 || !stat.size || stat.size > MAX_FILE_BYTES) throw unavailable()
  if (!inside(realRoot, await fs.realpath(filename))) throw unavailable()
  return { filename, stat }
}

export async function readLegacyImage(key, user, { root = LEGACY_UPLOAD_ROOT, ...access } = {}) {
  // Callers cannot bypass normalization by supplying a filesystem path.
  key = normalizeLegacyPath(`/${key}`)
  root = path.resolve(root)
  let handle
  try {
    const initial = await inspectFile(root, key)
    await authorizeLegacyImage(key, user, access)
    handle = await fs.open(initial.filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
    const stat = await handle.stat()
    if (!stat.isFile() || stat.dev !== initial.stat.dev || stat.ino !== initial.stat.ino || stat.size !== initial.stat.size || stat.nlink !== 1) throw unavailable()
    // Bounded read; changes or growth during delivery do not become an
    // unbounded allocation or a partially validated response.
    const bytes = Buffer.alloc(stat.size + 1)
    let offset = 0
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (!result.bytesRead) break
      offset += result.bytesRead
    }
    const after = await inspectFile(root, key)
    if (offset !== stat.size || after.stat.dev !== stat.dev || after.stat.ino !== stat.ino || after.stat.size !== stat.size || after.stat.mtimeMs !== stat.mtimeMs) throw unavailable()
    const buffer = bytes.subarray(0, offset)
    const type = await fileTypeFromBuffer(buffer).catch(() => undefined)
    if (!type || !RASTER_TYPES.has(type.mime)) throw unavailable()
    return { buffer, contentType: type.mime }
  } catch (error) {
    if (error?.code === 'IMAGE_NOT_FOUND') throw error
    if (['ENOENT', 'ENOTDIR', 'ELOOP', 'EACCES', 'EPERM', 'EINVAL'].includes(error?.code)) throw unavailable()
    throw error
  } finally { if (handle) await handle.close() }
}
