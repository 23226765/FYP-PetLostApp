import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pet: { type: mongoose.Schema.Types.ObjectId, ref: 'Pet', required: true },
    sighting: { type: mongoose.Schema.Types.ObjectId, ref: 'Sighting' },
    type: {
      type: String,
      enum: ['proximity', 'sighting', 'message', 'reunited'],
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
    photo: { type: String, default: '' },
    read: { type: Boolean, default: false },
    seedBatch: { type: String, default: undefined, select: false, immutable: true },
  },
  { timestamps: true, collection: 'notifications' },
)

notificationSchema.index({ user: 1, createdAt: -1 })
notificationSchema.index({ user: 1, pet: 1, type: 1, sighting: 1 })

export default mongoose.models.Notification || mongoose.model('Notification', notificationSchema)
