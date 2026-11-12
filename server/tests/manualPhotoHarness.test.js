import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createSinglePhotoStorage, createTaskTracker, scrubManualEnvironment, validateFreeCapacity } from '../scripts/manualPhotoSafety.js'

const namespace = `petlostapp/test/${'a'.repeat(32)}`
function fixture(overrides = {}) {
  const ledger = { objects: [], providerUploadAttempts: 0 }
  const calls = { uploads: 0, deletes: 0, stats: 0, saves: 0 }
  const objects = new Map()
  const storage = {
    publicIdFor: (_purpose, uuid) => `${namespace}/pets/${uuid}`,
    async stat(asset) { calls.stats++; return objects.get(asset.publicId) || null },
    async uploadImage(_buffer, asset) {
      calls.uploads++
      const metadata = { providerAssetId: 'provider-fixture-id', bytes: 7 }
      objects.set(asset.publicId, metadata)
      return metadata
    },
    async deleteImage(asset) { calls.deletes++; objects.delete(asset.publicId); return { deleted: true } },
    ...overrides,
  }
  const guard = createSinglePhotoStorage({ storage, namespace, ledger, save: async () => { calls.saves++ }, assertLocal() {}, ownerId: () => 'owner' })
  const asset = { _id: 'asset1', provider: 'cloudinary', purpose: 'pet', uploadedBy: 'owner',
    publicId: `${namespace}/pets/11111111-1111-4111-a111-111111111111`, idempotencyKey: 'fixture-key', checksum: 'a'.repeat(64) }
  return { ledger, calls, objects, guard, asset }
}

test('direct invocation refuses action without exposing inherited secrets', () => {
  const sentinel = 'Never-Print-Manual-Harness-Secret'
  const result = spawnSync(process.execPath, ['scripts/manualPhotoVerificationHarness.js'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', windowsHide: true,
    env: { ...process.env, CLOUDINARY_URL: sentinel, MONGODB_URI: sentinel }, timeout: 15000,
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /No action taken/)
  assert.ok(!`${result.stdout}${result.stderr}`.includes(sentinel))
})

test('Free/capacity gate fails closed for missing, paid, invalid or near-limit data', () => {
  assert.equal(validateFreeCapacity({ plan: 'Free', credits: { usage: 0.19, limit: 25 } }).creditsRemaining, 24.81)
  for (const data of [undefined, {}, { plan: 'Plus', credits: { usage: 0, limit: 25 } },
    { plan: 'Free', credits: { usage: '0', limit: 25 } }, { plan: 'Free', credits: { usage: NaN, limit: 25 } },
    { plan: 'Free', credits: { usage: 24.1, limit: 25 } }]) assert.throws(() => validateFreeCapacity(data))
})

test('scrub removes inherited provider, Atlas, proxy and runtime overrides', () => {
  const env = { PATH: 'preserve', CLOUDINARY_URL: 'private', CLOUDINARY_API_PROXY: 'private', HTTPS_PROXY: 'private', MONGOMS_SYSTEM_BINARY: 'private',
    MONGODB_URI: 'private', JWT_SECRET: 'private', NODE_OPTIONS: 'private', VITE_API_BASE_URL: 'private', DOTENV_CONFIG_PATH: 'private' }
  scrubManualEnvironment(env)
  assert.deepEqual(env, { PATH: 'preserve' })
})

test('concurrent calls consume exactly one slot before ledger awaits; exact cleanup confirms absence', async () => {
  const f = fixture()
  const first = f.guard.storage.uploadImage(Buffer.from('fixture'), f.asset)
  await assert.rejects(f.guard.storage.uploadImage(Buffer.from('fixture'), { ...f.asset, _id: 'asset2' }), { code: 'IMAGE_UPLOAD_QUOTA' })
  await first
  assert.equal(f.calls.uploads, 1)
  assert.equal(f.ledger.providerUploadAttempts, 1)
  assert.ok(f.ledger.objects[0].preflightAbsent)
  assert.equal(await f.guard.cleanup(), true)
  assert.equal(f.calls.deletes, 1)
  assert.equal(f.ledger.objects[0].absentConfirmed, true)
  assert.equal(f.ledger.objects[0].deleteSource, 'teardown')
})

test('second reservation compensation and mismatched IDs never reach provider deletion', async () => {
  const f = fixture()
  await f.guard.storage.uploadImage(Buffer.from('fixture'), f.asset)
  for (const invalid of [{ ...f.asset, _id: 'not-owned' }, { ...f.asset, providerAssetId: 'not-owned' },
    { ...f.asset, publicId: `${namespace}/pets/22222222-2222-4222-a222-222222222222` }]) {
    await assert.rejects(f.guard.storage.deleteImage(invalid), { code: 'IMAGE_REQUEST_INVALID' })
  }
  assert.equal(f.calls.deletes, 0)
})

test('failed durable reservation write prevents every provider operation and consumes the slot', async () => {
  let providerCalls = 0
  const ledger = { objects: [], providerUploadAttempts: 0 }
  const guard = createSinglePhotoStorage({ namespace, ledger, ownerId: () => 'owner', assertLocal() {},
    save: async () => { throw new Error('disk unavailable') },
    storage: { async stat() { providerCalls++ }, async uploadImage() { providerCalls++ } } })
  const { asset } = fixture()
  await assert.rejects(guard.storage.uploadImage(Buffer.from('fixture'), asset))
  await assert.rejects(guard.storage.uploadImage(Buffer.from('fixture'), asset), { code: 'IMAGE_UPLOAD_QUOTA' })
  assert.equal(providerCalls, 0)
  assert.equal(ledger.providerUploadAttempts, 0)
})

test('wrong actor or non-pet purpose cannot consume the approved upload', async () => {
  const f = fixture()
  await assert.rejects(f.guard.storage.uploadImage(Buffer.from('fixture'), { ...f.asset, uploadedBy: 'other' }), { code: 'IMAGE_REQUEST_INVALID' })
  await assert.rejects(f.guard.storage.uploadImage(Buffer.from('fixture'), { ...f.asset, purpose: 'avatar' }), { code: 'IMAGE_REQUEST_INVALID' })
  assert.equal(f.calls.stats, 0)
  await f.guard.storage.uploadImage(Buffer.from('fixture'), f.asset)
  assert.equal(f.calls.uploads, 1)
})

test('invalid or processed image above one MiB never reaches provider or consumes the slot', async () => {
  const f = fixture()
  for (const input of [null, 'not-a-buffer', Buffer.alloc(0), Buffer.alloc(1024 * 1024 + 1)]) {
    await assert.rejects(f.guard.storage.uploadImage(input, f.asset), { code: 'IMAGE_OUTPUT_TOO_LARGE' })
  }
  assert.equal(f.calls.stats, 0)
  assert.equal(f.ledger.objects.length, 0)
  await f.guard.storage.uploadImage(Buffer.alloc(1024 * 1024), f.asset)
  assert.equal(f.calls.uploads, 1)
})

test('preflight collision blocks upload and deletion', async () => {
  const f = fixture()
  f.objects.set(f.asset.publicId, { providerAssetId: 'existing' })
  await assert.rejects(f.guard.storage.uploadImage(Buffer.from('fixture'), f.asset), { code: 'IMAGE_STORAGE_CONFLICT' })
  await assert.rejects(f.guard.storage.deleteImage(f.asset), { code: 'IMAGE_STORAGE_CONFLICT' })
  assert.equal(f.calls.uploads, 0)
  assert.equal(f.calls.deletes, 0)
  assert.equal(await f.guard.cleanup(), true) // Preflight proved no write was attempted.
})

test('ambiguous failure consumes the cap and retains a recovery ledger without unsafe cleanup', async () => {
  const f = fixture({ async uploadImage() { throw new Error('private provider detail') } })
  await assert.rejects(f.guard.storage.uploadImage(Buffer.from('fixture'), f.asset), { code: 'IMAGE_STORAGE_UNAVAILABLE' })
  await assert.rejects(f.guard.storage.uploadImage(Buffer.from('fixture'), f.asset), { code: 'IMAGE_UPLOAD_QUOTA' })
  await assert.rejects(f.guard.storage.deleteImage(f.asset), { code: 'IMAGE_STORAGE_UNAVAILABLE' })
  assert.equal(await f.guard.cleanup(), false)
  assert.equal(f.ledger.objects[0].recoveryRequired, true)
  assert.equal(f.calls.deletes, 0)
  assert.ok(!JSON.stringify(f.ledger).includes('private provider detail'))
})

test('cleanup waits for active upload before querying/deleting its completed exact object', async () => {
  let finish, started
  const began = new Promise(resolve => { started = resolve })
  const f = fixture({ async uploadImage(_bytes, asset) {
    started()
    await new Promise(resolve => { finish = resolve })
    const metadata = { providerAssetId: 'provider-fixture-id', bytes: 7 }
    f.objects.set(asset.publicId, metadata)
    return metadata
  } })
  const upload = f.guard.storage.uploadImage(Buffer.from('fixture'), f.asset)
  await began
  let cleaned = false
  const cleanup = f.guard.cleanup().then(result => { cleaned = true; return result })
  await Promise.resolve()
  assert.equal(cleaned, false)
  assert.equal(f.calls.deletes, 0)
  finish()
  await upload
  assert.equal(await cleanup, true)
  assert.equal(f.calls.deletes, 1)
})

test('tracker drains promises added by active handlers before their completion', async () => {
  const tracker = createTaskTracker()
  const events = []
  void tracker.run(async () => { void tracker.run(async () => { await Promise.resolve(); events.push('nested') }); events.push('outer') })
  await tracker.drain()
  assert.deepEqual(events, ['outer', 'nested'])
  assert.equal(tracker.size, 0)
})
