import mongoose from 'mongoose'

const userBlockSchema = new mongoose.Schema(
  {
    blocker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    blocked: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    seedBatch: { type: String, default: undefined, select: false, immutable: true },
  },
  { timestamps: true, collection: 'userblocks' },
)

userBlockSchema.index(
  { blocker: 1, blocked: 1 },
  { unique: true, name: 'one_block_per_user_pair' },
)
userBlockSchema.index({ blocked: 1, blocker: 1 })

export default mongoose.models.UserBlock || mongoose.model('UserBlock', userBlockSchema)
