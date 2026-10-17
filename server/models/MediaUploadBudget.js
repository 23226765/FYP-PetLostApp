import mongoose from 'mongoose'

// Private serialization lock; authoritative counts remain in MediaAsset.
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  revision: { type: Number, default: 0, min: 0 },
}, { timestamps: true, collection: 'mediauploadbudgets', autoCreate: false, autoIndex: false })
schema.index({ user: 1 }, { unique: true })
export default mongoose.models.MediaUploadBudget || mongoose.model('MediaUploadBudget', schema)
