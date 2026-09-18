import mongoose from 'mongoose'

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (value) =>
          Array.isArray(value) &&
          value.length === 2 &&
          value.every(Number.isFinite) &&
          value[0] >= -180 &&
          value[0] <= 180 &&
          value[1] >= -90 &&
          value[1] <= 90,
        message: 'coordinates must be [lng, lat]',
      },
    },
  },
  { _id: false },
)

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  realName: {
    type: String,
    trim: true,
    maxlength: 100,
    default: '',
    select: false,
  },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  phone: { type: String, default: '' },
  avatar: {
    type: String,
    default: '',
  },
  role: { type: String, enum: ['user', 'shelter_admin'], default: 'user' },
  alertsEnabled: { type: Boolean, default: true },
  alertRadiusKm: { type: Number, min: 1, max: 50, default: 3 },
  alertLocation: { type: pointSchema, default: undefined },
  createdAt: { type: Date, default: Date.now },
})

userSchema.index({ alertLocation: '2dsphere' })

export default mongoose.models.User || mongoose.model('User', userSchema)
