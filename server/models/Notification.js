import mongoose from 'mongoose'

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pet: { type: mongoose.Schema.Types.ObjectId, ref: 'Pet', required: true },
    sighting: { type: mongoose.Schema.Types.ObjectId, ref: 'Sighting' },
    type: { type: String, enum: ['proximity', 'sighting'], required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    photo: { type: String, default: '' },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
)

notificationSchema.index({ user: 1, createdAt: -1 })
notificationSchema.index({ user: 1, pet: 1, type: 1, sighting: 1 })

export default mongoose.models.Notification || mongoose.model('Notification', notificationSchema)
