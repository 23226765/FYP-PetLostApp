import mongoose from 'mongoose'
import { moderationFields } from './moderationFields.js'

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

const straySchema = new mongoose.Schema(
  {
    species: { type: String, enum: ['Dog', 'Cat', 'Other'], required: true },
    animalType: { type: String, trim: true, maxlength: 80, default: '' },
    description: { type: String, required: true, trim: true },
    photo: { type: String, default: '' },
    photos: {
      type: [String],
      default: [],
      validate: {
        validator: (values) => values.length <= 6,
        message: 'A stray post can contain at most 6 photos.',
      },
    },
    condition: {
      type: String,
      enum: ['unknown', 'healthy', 'injured', 'critical'],
      default: 'unknown',
    },
    district: { type: String, required: true, trim: true },
    locationName: { type: String, required: true, trim: true },
    location: { type: pointSchema, required: true },
    rescueStatus: {
      type: String,
      enum: ['reported', 'rescue_dispatched', 'rescued'],
      default: 'reported',
    },
    reporterName: { type: String, required: true, trim: true },
    reporterPhone: { type: String, default: '', trim: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    observedAt: { type: Date, default: Date.now },
    statusUpdatedAt: { type: Date, default: Date.now },
    active: { type: Boolean, default: true },
    ...moderationFields,
    submissionId: { type: String, trim: true, maxlength: 100, default: undefined },
    seedBatch: { type: String, default: undefined, select: false, immutable: true },
  },
  { timestamps: true, collection: 'strays' },
)

straySchema.index({ location: '2dsphere' })
straySchema.index({ district: 1, rescueStatus: 1, createdAt: -1 })
straySchema.index({ reportedBy: 1, createdAt: -1 })
straySchema.index(
  { reportedBy: 1, submissionId: 1 },
  { name: 'stray_submission_idempotency_v2', unique: true, partialFilterExpression: { submissionId: { $type: 'string' } } },
)

export default mongoose.models.Stray || mongoose.model('Stray', straySchema)
