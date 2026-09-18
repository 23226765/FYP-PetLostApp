import mongoose from 'mongoose'

const savedStraySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    stray: { type: mongoose.Schema.Types.ObjectId, ref: 'Stray', required: true },
    seedBatch: { type: String, default: undefined, select: false, immutable: true },
  },
  { timestamps: true, collection: 'savedstrays' },
)

savedStraySchema.index({ user: 1, stray: 1 }, { unique: true })
savedStraySchema.index({ user: 1, createdAt: -1 })

export default mongoose.models.SavedStray || mongoose.model('SavedStray', savedStraySchema)
