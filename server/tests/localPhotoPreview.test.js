import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { PREVIEW_PORT, PET_CENTRE, RESCUE_CENTRE, preparePreviewEnvironment, fixtureDocuments } from '../scripts/localPhotoPreviewSupport.js'

test('preview environment removes inherited database/provider settings and disables mutation services', () => {
  const env = { MONGODB_URI: 'forbidden-fixture-uri', CLOUDINARY_URL: 'forbidden', CLOUDFLARE_API_TOKEN: 'forbidden', ASSISTANT_PROVIDER: 'forbidden', HTTPS_PROXY: 'forbidden', VITE_API_BASE_URL: 'forbidden', DOTENV_CONFIG_PATH: 'forbidden', NODE_OPTIONS: 'forbidden', PATH: 'keep' }
  preparePreviewEnvironment(env)
  assert.equal(env.PATH, 'keep')
  for (const key of ['MONGODB_URI', 'CLOUDINARY_URL', 'CLOUDFLARE_API_TOKEN', 'HTTPS_PROXY', 'VITE_API_BASE_URL', 'DOTENV_CONFIG_PATH', 'NODE_OPTIONS']) assert.equal(env[key], undefined)
  for (const key of ['ALLOW_TEST_SEED', 'IMAGE_UPLOADS_ENABLED', 'ASSISTANT_AI_ENABLED', 'ALLOW_IMAGE_MIGRATION', 'ALLOW_IMAGE_CLEANUP', 'ALLOW_MEDIA_RECONCILIATION', 'MONGOMS_RUNTIME_DOWNLOAD']) assert.equal(env[key], 'false')
})

test('fictional records explicitly attach existing licensed local photographs instead of image fallbacks', () => {
  const docs = fixtureDocuments({ origin: `http://127.0.0.1:${PREVIEW_PORT}`, run: 'a'.repeat(32), creatorId: 'creator-fixture', now: new Date('2026-11-12T00:00:00Z') })
  assert.equal(docs.pets.length, 2); assert.equal(docs.strays.length, 2)
  assert.notDeepEqual(PET_CENTRE, RESCUE_CENTRE)
  for (const record of [...docs.pets, ...docs.strays]) {
    assert.match(record.description, /fictional/i)
    assert.equal(record.reportedBy, 'creator-fixture')
    assert.equal(record.photo, `http://127.0.0.1:${PREVIEW_PORT}/test-photos/${record.species.toLowerCase()}.jpg`)
    assert.deepEqual(record.photos, [record.photo])
    assert.match(record.seedBatch, /^local-photo-preview-/)
    assert.equal(record.imageIds, undefined)
    assert.equal(record.location.type, 'Point')
    assert.ok(record.location.coordinates[0] > 100 && record.location.coordinates[1] < 30)
  }
  assert.throws(() => fixtureDocuments({ origin: 'https://remote.invalid', run: 'a'.repeat(32) }))
})

test('CLI without explicit local-only flag exits before database/provider initialization', () => {
  const file = new URL('../scripts/localPhotoPreview.js', import.meta.url)
  const result = spawnSync(process.execPath, [fileURLToPath(file)], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /No action taken/)
})

test('preview source does not load runtime configuration, real storage or provider secrets', () => {
  const source = readFileSync(new URL('../scripts/localPhotoPreview.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /dotenv\.config|dotenv\.parse|readFile\([^\n]*\.env|from ['"]cloudinary['"]|import\(['"]cloudinary['"]\)/)
  assert.match(source, /configFile: false, envDir: false/)
  assert.match(source, /validateLocalTransactionUri\(uri\)/)
  assert.match(source, /storageAttempts, 0/)
})
