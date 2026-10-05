import mongoose from 'mongoose'
import { IMAGE_LIMITS, IMAGE_PURPOSES } from '../config/imageStorage.js'

const privateString = { type: String, select: false }
const mediaAssetSchema = new mongoose.Schema({
  provider: { type: String, enum: ['cloudinary'], required: true, immutable: true },
  publicId: { ...privateString, required: true, immutable: true, maxlength: 180 },
  providerAssetId: { ...privateString, maxlength: 200 },
  secureUrl: {
    ...privateString, maxlength: 2048,
    validate: { validator: (value) => !value || /^https:\/\/res\.cloudinary\.com\//.test(value), message: 'Invalid managed image URL.' },
  },
  width: { type: Number, min: 1, max: IMAGE_LIMITS.side },
  height: { type: Number, min: 1, max: IMAGE_LIMITS.side },
  format: { type: String, enum: ['webp'] },
  bytes: { type: Number, min: 1, max: 1024 * 1024 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true, select: false },
  purpose: { type: String, enum: Object.keys(IMAGE_PURPOSES), required: true, immutable: true },
  state: {
    type: String, enum: ['uploading', 'pending', 'attached', 'delete_pending', 'deleted', 'failed'],
    default: 'uploading', required: true, select: false,
  },
  attachedTo: {
    type: new mongoose.Schema({
      type: { type: String, enum: ['user', 'pet', 'sighting', 'stray', 'message'], required: true },
      id: { type: mongoose.Schema.Types.ObjectId, required: true },
    }, { _id: false }),
    default: undefined, select: false,
  },
  checksum: { ...privateString, required: true, match: /^[a-f0-9]{64}$/, immutable: true },
  idempotencyKey: { ...privateString, required: true, minlength: 8, maxlength: 100, immutable: true },
  expiresAt: { type: Date, required: true, select: false },
  cleanupAttempts: { type: Number, default: 0, min: 0, select: false },
  failureCode: { ...privateString, enum: ['IMAGE_STORAGE_UNAVAILABLE', 'IMAGE_DATABASE_UNAVAILABLE', 'IMAGE_STORAGE_CONFLICT'] },
}, { timestamps: true, collection: 'mediaassets', autoCreate: false, autoIndex: false, strict: 'throw' })

mediaAssetSchema.pre('validate', function () {
  if (['pending', 'attached'].includes(this.state)) {
    for (const field of ['providerAssetId', 'secureUrl', 'width', 'height', 'format', 'bytes']) {
      if (!this[field]) this.invalidate(field, 'Ready images require complete metadata.')
    }
    const policy = IMAGE_PURPOSES[this.purpose]
    if (policy && (this.width > policy.side || this.height > policy.side || this.bytes > policy.bytes)) {
      this.invalidate('bytes', 'Image exceeds the purpose policy.')
    }
  }
  if (this.state === 'attached' && !this.attachedTo) this.invalidate('attachedTo', 'Attached images require a target.')
})
mediaAssetSchema.index({ provider: 1, publicId: 1 }, { unique: true, name: 'media_provider_public_id' })
mediaAssetSchema.index({ uploadedBy: 1, idempotencyKey: 1 }, { unique: true, name: 'media_upload_idempotency' })
mediaAssetSchema.index({ uploadedBy: 1, createdAt: -1 })
mediaAssetSchema.index({ state: 1, expiresAt: 1 }) // Deliberately not TTL: provider deletion must happen first.
mediaAssetSchema.index({ 'attachedTo.type': 1, 'attachedTo.id': 1 })

export default mongoose.models.MediaAsset || mongoose.model('MediaAsset', mediaAssetSchema)
