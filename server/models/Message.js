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
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    participant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    text: { type: String, default: '', trim: true, maxlength: 2000 },
    photo: { type: String, default: '' },
    sharedStray: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Stray',
      default: null,
    },
    clientRequestId: { type: String, trim: true, maxlength: 100, default: undefined },
    seedBatch: { type: String, default: undefined, select: false, immutable: true },
  },
  { timestamps: true, collection: 'messages' },
)

messageSchema.index({ pet: 1, createdAt: 1 })
messageSchema.index({ sentBy: 1, createdAt: -1 })
messageSchema.index({ pet: 1, participant: 1, createdAt: 1 })
messageSchema.index(
  { sentBy: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } },
)

export default mongoose.models.Message || mongoose.model('Message', messageSchema)
