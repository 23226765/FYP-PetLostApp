import test from 'node:test'
import assert from 'node:assert/strict'
import { Writable } from 'node:stream'
import mongoose from 'mongoose'
import { createCloudinaryStorage } from '../services/storage/cloudinaryStorage.js'
import { imageStorageConfig, managedUploadsEnabled } from '../config/imageStorage.js'
import MediaAsset from '../models/MediaAsset.js'

const config = { namespace: 'petlostapp/test', cloudName: 'fixture-cloud', apiKey: '123456789', apiSecret: 'fictional-test-only-secret' }
const publicId = 'petlostapp/test/pets/12345678-1234-4234-8234-123456789abc'
const asset = { provider: 'cloudinary', publicId }
function result(overrides = {}) {
  return { public_id: publicId, asset_id: 'fixture-id', type: 'authenticated', resource_type: 'image',
    secure_url: `https://res.cloudinary.com/fixture-cloud/image/authenticated/${publicId}.webp`,
    format: 'webp', width: 10, height: 10, bytes: 8, ...overrides }
}
function sdkFor(response, collect = () => {}) {
  return { uploader: { upload_stream(opts, callback) {
    return new Writable({ write(chunk, _encoding, done) { collect(opts, chunk); done() }, final(done) { callback(null, response); done() } })
  } } }
}

test('managed uploads default to disabled and config errors never echo credentials', () => {
  assert.equal(managedUploadsEnabled({}), false)
  assert.equal(managedUploadsEnabled({ IMAGE_UPLOADS_ENABLED: 'true' }), true)
  for (const value of [{}, { CLOUDINARY_API_SECRET: 'must-not-leak' }, { MEDIA_NAMESPACE: '../unsafe' }]) {
    assert.throws(() => imageStorageConfig(value), (error) => error.code === 'IMAGE_STORAGE_CONFIG_INVALID' && !error.message.includes('must-not-leak'))
  }
  assert.equal(imageStorageConfig({ CLOUDINARY_CLOUD_NAME: 'fixture-cloud', CLOUDINARY_API_KEY: '123456789', CLOUDINARY_API_SECRET: 'fictional-test-secret' }).namespace, 'petlostapp/dev')
})

test('adapter streams bytes with authenticated delivery and overwrite disabled', async () => {
  let received, options
  const sdk = sdkFor(result(), (opts, buffer) => { options = opts; received = buffer })
  const buffer = Buffer.from('fixture!')
  const metadata = await createCloudinaryStorage(config, sdk).uploadImage(buffer, asset)
  assert.deepEqual(received, buffer)
  assert.equal(options.type, 'authenticated')
  assert.equal(options.overwrite, false)
  assert.equal(options.timeout, 30_000)
  assert.equal(metadata.provider, 'cloudinary')
  assert.equal(metadata.bytes, 8)
  assert.equal(Object.hasOwn(metadata, 'apiSecret'), false)
})

test('provider errors and malformed/existing-object responses are sanitized', async () => {
  for (const response of [result({ secure_url: 'http://unsafe.test/image' }), result({ public_id: 'wrong-id' })]) {
    await assert.rejects(createCloudinaryStorage(config, sdkFor(response)).uploadImage(Buffer.from('fixture'), asset), { code: 'IMAGE_STORAGE_UNAVAILABLE' })
  }
  await assert.rejects(createCloudinaryStorage(config, sdkFor(result({ existing: true }))).uploadImage(Buffer.from('fixture'), asset), { code: 'IMAGE_STORAGE_CONFLICT' })
  const sdk = { api: { resource: async () => { throw new Error('request credentials must-not-leak') } } }
  await assert.rejects(createCloudinaryStorage(config, sdk).stat(asset), (error) => error.code === 'IMAGE_STORAGE_UNAVAILABLE' && !error.message.includes('must-not-leak'))
})

test('deletion is exact and idempotent; IDs outside our namespace are rejected', async () => {
  let calls = 0
  const sdk = { uploader: { destroy: async (id, opts) => {
    calls++; assert.equal(id, publicId); assert.equal(opts.type, 'authenticated'); assert.equal(opts.invalidate, true)
    return { result: calls === 1 ? 'ok' : 'not found' }
  } } }
  const storage = createCloudinaryStorage(config, sdk)
  assert.deepEqual(await storage.deleteImage(asset), { deleted: true })
  assert.deepEqual(await storage.deleteImage(asset), { deleted: true })
  await assert.rejects(storage.deleteImage({ provider: 'cloudinary', publicId: 'arbitrary-client-id' }), { code: 'IMAGE_REQUEST_INVALID' })
  assert.equal(calls, 2)
})

test('stat distinguishes a confirmed missing object from provider unavailability', async () => {
  const sdk = { api: { resource: async () => { throw { error: { http_code: 404 } } } } }
  assert.equal(await createCloudinaryStorage(config, sdk).stat(asset), null)
})

test('delivery signatures stay backend-only and provider redirects are forbidden', async () => {
  const signed = 'https://res.cloudinary.com/fixture-cloud/image/authenticated/s--fixture--/asset.webp'
  const sdk = { url(id, opts) { assert.equal(id, publicId); assert.equal(opts.sign_url, true); return signed } }
  const storage = createCloudinaryStorage(config, sdk, async (url, options) => {
    assert.equal(url, signed); assert.equal(options.redirect, 'error')
    return new Response(Buffer.from('safe'), { headers: { 'content-type': 'image/webp' } })
  })
  assert.equal(typeof (await storage.openReadStream(asset)).getReader, 'function')
})

test('public IDs use purpose folders and server UUIDs without personal data', () => {
  const storage = createCloudinaryStorage(config, {})
  assert.equal(storage.publicIdFor('pet', '12345678-1234-4234-8234-123456789abc'), publicId)
  assert.throws(() => storage.publicIdFor('pet', 'owner@example.test'), { code: 'IMAGE_REQUEST_INVALID' })
  assert.throws(() => storage.publicIdFor('__proto__', '12345678-1234-4234-8234-123456789abc'), { code: 'IMAGE_REQUEST_INVALID' })
})

test('MediaAsset has private metadata, timestamps, strict validation and no TTL deletion', async () => {
  assert.equal(MediaAsset.collection.name, 'mediaassets')
  assert.equal(MediaAsset.schema.options.timestamps, true)
  assert.equal(MediaAsset.schema.options.autoCreate, false)
  for (const field of ['publicId', 'secureUrl', 'uploadedBy', 'checksum', 'state', 'idempotencyKey']) {
    assert.equal(MediaAsset.schema.path(field).options.select, false)
  }
  assert.equal(MediaAsset.schema.indexes().some(([, opts]) => Object.hasOwn(opts, 'expireAfterSeconds')), false)
  const reservation = new MediaAsset({ provider: 'cloudinary', publicId, uploadedBy: new mongoose.Types.ObjectId(), purpose: 'pet', checksum: 'a'.repeat(64), idempotencyKey: 'fixture-key', expiresAt: new Date() })
  await reservation.validate()
  reservation.state = 'pending'
  await assert.rejects(reservation.validate(), { name: 'ValidationError' })
  assert.throws(() => new MediaAsset({ unknownClientField: true }), { name: 'StrictModeError' })
})
