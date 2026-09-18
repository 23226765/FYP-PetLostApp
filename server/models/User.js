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

const privacySchema = new mongoose.Schema(
  {
    contactVisibility: {
      type: String,
      enum: ['private', 'authenticated'],
      default: 'private',
    },
  },
  { _id: false },
)

const preferencesSchema = new mongoose.Schema(
  {
    language: {
      type: String,
      enum: ['en', 'zh-HK', 'zh-CN'],
      default: 'en',
    },
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light',
    },
  },
  { _id: false, strict: 'throw' },
)

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    realName: {
      type: String,
      trim: true,
      maxlength: 100,
      default: '',
      select: false,
    },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    phone: { type: String, default: '', trim: true, maxlength: 30 },
    avatar: { type: String, default: '', trim: true },
    role: { type: String, enum: ['user', 'shelter_admin'], default: 'user' },
    alertsEnabled: { type: Boolean, default: true },
    alertRadiusKm: { type: Number, min: 1, max: 50, default: 3 },
    alertLocation: { type: pointSchema, default: undefined },
    privacy: { type: privacySchema, default: () => ({ contactVisibility: 'private' }) },
    preferences: {
      type: preferencesSchema,
      default: () => ({ language: 'en', theme: 'light' }),
    },
    seedBatch: { type: String, default: undefined, select: false, immutable: true },
  },
  { timestamps: true, collection: 'users' },
)

userSchema.index({ alertLocation: '2dsphere' })

export default mongoose.models.User || mongoose.model('User', userSchema)
