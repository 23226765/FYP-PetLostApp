import mongoose from 'mongoose'

const messageSchema = new mongoose.Schema(
  {
    pet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pet',
      required: true,
    },
    sender: {
      type: String,
      enum: ['owner', 'finder'],
      required: true,
    },
    text: { type: String, default: '', trim: true },
    photo: { type: String, default: '' },
  },
  { timestamps: true },
)

messageSchema.index({ pet: 1, createdAt: 1 })

export default mongoose.models.Message || mongoose.model('Message', messageSchema)
