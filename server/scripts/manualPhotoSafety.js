// Safety boundaries for the opt-in manual provider harness; no startup or IO.
import assert from 'node:assert/strict'
import { imageError } from '../services/imageErrors.js'

export function scrubManualEnvironment(environment) {
  for (const key of Object.keys(environment)) {
    if (/MONGO|CLOUDINARY|SECRET|PASSWORD|TOKEN|DOTENV|PROXY|^VITE_|^MEDIA_|^NODE_OPTIONS$|^DEBUG$/i.test(key)) delete environment[key]
  }
}

export function validateFreeCapacity(usage) {
  const used = usage?.credits?.usage, limit = usage?.credits?.limit
  assert.equal(String(usage?.plan || '').trim().toLowerCase(), 'free', 'Free plan must be confirmed')
  assert.ok(typeof used === 'number' && Number.isFinite(used) && used >= 0)
  assert.ok(typeof limit === 'number' && Number.isFinite(limit) && limit > 0)
  // A deliberate conservative reserve for one <=1 MiB image and manual viewing.
  assert.ok(limit - used >= 1, 'At least one credit of headroom is required')
  return { checkedAt: new Date().toISOString(), plan: 'Free', creditsUsed: used, creditsLimit: limit, creditsRemaining: limit - used }
}

export function createTaskTracker() {
  const tasks = new Set()
  return {
    run(operation) {
      const task = Promise.resolve().then(operation)
      tasks.add(task)
      task.then(() => tasks.delete(task), () => tasks.delete(task))
      return task
    },
    async drain() { while (tasks.size) await Promise.allSettled([...tasks]) },
    get size() { return tasks.size },
  }
}

export function createSinglePhotoStorage({ storage, namespace, ledger, save, assertLocal, ownerId }) {
  assert.match(namespace, /^petlostapp\/test\/[a-f0-9]{32}$/)
  const tracker = createTaskTracker()
  let claimed = false, closed = false
  const exact = (asset) => {
    assertLocal()
    const entry = ledger.objects.find(item => item.publicId === asset?.publicId)
    if (!entry || asset?.provider !== 'cloudinary' || (asset._id && String(asset._id) !== entry.assetId)
      || (asset.providerAssetId && entry.providerAssetId && asset.providerAssetId !== entry.providerAssetId)) throw imageError('IMAGE_REQUEST_INVALID')
    if (entry.collision || !entry.preflightAbsent || !entry.uploadStarted) throw imageError('IMAGE_STORAGE_CONFLICT')
    return entry
  }
  const guardedDelete = async (asset, source) => {
    const entry = exact(asset)
    if (entry.ambiguous) throw imageError('IMAGE_STORAGE_UNAVAILABLE')
    const found = await storage.stat(entry)
    if (found && entry.providerAssetId && found.providerAssetId !== entry.providerAssetId) throw imageError('IMAGE_STORAGE_CONFLICT')
    if (found) {
      await storage.deleteImage(entry)
      entry.deleteSource = source
      entry.deletedAt = new Date().toISOString()
    }
    assert.equal(await storage.stat(entry), null)
    entry.absentConfirmed = true
    await save()
    return { deleted: true }
  }
  const wrapped = Object.freeze({
    provider: 'cloudinary',
    publicIdFor(purpose, uuid) {
      if (purpose !== 'pet') throw imageError('IMAGE_PURPOSE_INVALID')
      return storage.publicIdFor(purpose, uuid)
    },
    uploadImage(buffer, asset) {
      // Claim before ANY await, including ledger IO/preflight, to prevent races.
      if (closed || claimed) return Promise.reject(imageError('IMAGE_UPLOAD_QUOTA'))
      if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 1024 * 1024) return Promise.reject(imageError('IMAGE_OUTPUT_TOO_LARGE'))
      if (asset.purpose !== 'pet' || String(asset.uploadedBy) !== String(ownerId())
        || asset.provider !== 'cloudinary' || !asset.publicId.startsWith(`${namespace}/pets/`)
        || !/^[a-f0-9-]{36}$/i.test(asset.publicId.slice(`${namespace}/pets/`.length))) return Promise.reject(imageError('IMAGE_REQUEST_INVALID'))
      assertLocal()
      claimed = true
      const entry = { assetId: String(asset._id), provider: 'cloudinary', publicId: asset.publicId,
        purpose: 'pet', ownerId: String(asset.uploadedBy), imageKey: asset.idempotencyKey,
        checksum: asset.checksum, reservedAt: new Date().toISOString(), uploadStarted: false }
      ledger.objects.push(entry)
      return tracker.run(async () => {
        await save() // Durable exact target BEFORE even the preflight query.
        if (await storage.stat(entry)) {
          entry.collision = true; await save(); throw imageError('IMAGE_STORAGE_CONFLICT')
        }
        entry.preflightAbsent = true
        entry.uploadStarted = true
        ledger.providerUploadAttempts = (ledger.providerUploadAttempts || 0) + 1
        assert.equal(ledger.providerUploadAttempts, 1)
        await save() // Persist consumed attempt before contacting upload endpoint.
        let metadata
        try { metadata = await storage.uploadImage(buffer, asset) }
        catch (error) {
          if (error?.code === 'IMAGE_STORAGE_CONFLICT') entry.collision = true
          else entry.ambiguous = true // A timeout can finish remotely after rejection.
          entry.uploadFailedAt = new Date().toISOString()
          await save()
          throw imageError(error?.code === 'IMAGE_STORAGE_CONFLICT' ? 'IMAGE_STORAGE_CONFLICT' : 'IMAGE_STORAGE_UNAVAILABLE')
        }
        entry.providerAssetId = metadata.providerAssetId
        entry.bytes = metadata.bytes
        entry.uploadedAt = new Date().toISOString()
        await save()
        return metadata
      })
    },
    stat(asset) { return tracker.run(() => { exact(asset); return storage.stat(asset) }) },
    deleteImage(asset) { return tracker.run(() => guardedDelete(asset, 'application')) },
    openReadStream(asset) {
      return tracker.run(async () => {
        exact(asset)
        const stream = await storage.openReadStream(asset)
        ledger.providerReadStarts = (ledger.providerReadStarts || 0) + 1
        await save()
        return stream
      })
    },
  })
  return {
    storage: wrapped,
    close() { closed = true },
    drain: tracker.drain,
    get activeOperations() { return tracker.size },
    async cleanup() {
      closed = true
      await tracker.drain()
      for (const entry of ledger.objects) {
        if (!entry.uploadStarted) { entry.noUploadAttempted = true; await save(); continue }
        // Do not destroy an object after a collision or ambiguous provider result.
        if (entry.collision || entry.ambiguous) { entry.recoveryRequired = true; await save(); continue }
        try { await guardedDelete(entry, 'teardown') }
        catch { entry.recoveryRequired = true; await save() }
      }
      return ledger.objects.every(entry => entry.noUploadAttempted || entry.absentConfirmed)
    },
  }
}
