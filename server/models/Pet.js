import mongoose from 'mongoose'
import { moderationFields } from './moderationFields.js'

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (v) =>
          v.length === 2 && v[0] >= -180 && v[0] <= 180 && v[1] >= -90 && v[1] <= 90,
        message: 'coordinates must be [lng, lat]',
      },
    },
  },
  { _id: false },
)

const petSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    species: { type: String, enum: ['Dog', 'Cat', 'Other'], required: true },
    breed: { type: String, default: '', trim: true, maxlength: 120 },
    district: { type: String, default: '', trim: true },
    photo: { type: String, default: '' },
    photos: [{ type: String }],
    imageIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'MediaAsset', default: undefined, select: false },
    submissionId: { type: String, maxlength: 128, select: false, default: undefined },
    description: { type: String, default: '', trim: true, maxlength: 3000 },
    details: { type: String, default: '', trim: true, maxlength: 3000 },
    reward: { type: String, default: '' },
    ownerName: { type: String, default: '' },
    ownerPhone: { type: String, default: '' },
    status: { type: String, enum: ['lost', 'sighted', 'reunited'], default: 'lost' },
    locationName: { type: String, default: '' },
    location: { type: pointSchema, required: true },
    lastSeen: { type: Date },
    mapX: { type: Number, default: 50 },
    mapY: { type: Number, default: 50 },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ...moderationFields,
    seedBatch: { type: String, default: undefined, select: false, immutable: true },
  },
  { timestamps: true, collection: 'pets' },
)

// Geospatial index for $near / $geoNear queries
petSchema.index({ location: '2dsphere' })
// Compound index for species & status filtering
petSchema.index({ species: 1, status: 1 })
petSchema.index({ district: 1, breed: 1, status: 1 })
petSchema.index({ reportedBy: 1, createdAt: -1 })
petSchema.index({ reportedBy: 1, submissionId: 1 }, { unique: true, partialFilterExpression: { submissionId: { $type: 'string' } } })

export default mongoose.models.Pet || mongoose.model('Pet', petSchema)
