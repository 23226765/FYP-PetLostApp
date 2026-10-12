// Invoked by the existing guarded Atlas harness. No standalone connection,
// writes, uploads, migration, seeding, index initialization or file changes.
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { LEGACY_UPLOAD_ROOT, normalizeLegacyPath, readLegacyImage } from '../services/legacyImageAccess.js'

const hash = (buffer) => createHash('sha256').update(buffer).digest('hex')
export async function verifyLegacyImagesReadOnly({ base, actors }) {
  const paths = []
  async function walk(directory, prefix = '') {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      const key = prefix + entry.name
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), `${key}/`)
      else if (entry.isFile()) paths.push(key)
    }
  }
  try { await walk(LEGACY_UPLOAD_ROOT) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const before = new Map()
  let allowed = 0, denied = 0
  for (const key of paths) {
    normalizeLegacyPath(`/${key}`)
    before.set(key, hash(await fs.readFile(path.join(LEGACY_UPLOAD_ROOT, key))))
    for (const actor of actors) {
      let expected
      try { expected = await readLegacyImage(key, actor?.user) }
      catch (error) { if (error.code !== 'IMAGE_NOT_FOUND') throw error }
      for (const root of [new URL(base).origin + '/uploads', base + '/uploads/legacy']) {
        const response = await fetch(`${root}/${key.split('/').map(encodeURIComponent).join('/')}`, {
          headers: actor?.token ? { Authorization: `Bearer ${actor.token}` } : {}, signal: AbortSignal.timeout(15000),
        })
        assert.equal(response.status, expected ? 200 : 404, 'Protected legacy response status mismatch')
        assert.match(response.headers.get('cache-control'), /private, no-store/, 'Protected legacy caching mismatch')
        assert.equal(response.headers.get('etag'), null, 'Protected legacy response must not provide an ETag')
        if (expected) {
          assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(expected.buffer))
          allowed++
        } else {
          const payload = await response.json(); assert.equal(payload.code, 'IMAGE_NOT_FOUND')
          denied++
        }
      }
    }
  }
  for (const [key, digest] of before) assert.equal(hash(await fs.readFile(path.join(LEGACY_UPLOAD_ROOT, key))), digest)
  const missing = await fetch(`${base}/uploads/legacy/nonexistent-read-only-verification.webp`, { signal: AbortSignal.timeout(15000) })
  assert.equal(missing.status, 404)
  console.log(`PASS live protected legacy delivery: ${paths.length} existing files, ${allowed} authorized reads, ${denied} unavailable reads; file hashes unchanged.`)
  if (!paths.length) console.log('SKIP live legacy binary coverage: no existing local files; isolated filesystem/authorization tests are separate.')
}
