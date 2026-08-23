import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: '' },
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [114.1694, 22.3193] },
    },
    notificationsEnabled: { type: Boolean, default: true },
  },
  { timestamps: true },
)

userSchema.index({ location: '2dsphere' })

export default mongoose.models.User || mongoose.model('User', userSchema)