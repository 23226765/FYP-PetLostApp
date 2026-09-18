import mongoose from 'mongoose'

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (v) =>
          Array.isArray(v) &&
          v.length === 2 &&
          v.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate)) &&
          v[0] >= -180 &&
          v[0] <= 180 &&
          v[1] >= -90 &&
          v[1] <= 90,
        message: 'coordinates must be [lng, lat]',
      },
    },
  },
  { _id: false },
)

const sightingSchema = new mongoose.Schema(
  {
    pet: { type: mongoose.Schema.Types.ObjectId, ref: 'Pet', required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    location: { type: pointSchema, required: true },
    locationName: { type: String, required: true, trim: true, maxlength: 200 },
    note: { type: String, default: '', trim: true, maxlength: 2000 },
    photo: { type: String, default: '' },
    reporterName: { type: String, default: '' },
    reporterPhone: { type: String, default: '' },
    confirmedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    resolved: { type: Boolean, default: false },
    sightedAt: { type: Date, required: true, default: Date.now },
    submissionId: {
      type: String,
      trim: true,
      maxlength: 128,
      default: undefined,
      select: false,
      immutable: true,
    },
    seedBatch: { type: String, default: undefined, select: false, immutable: true },
  },
  { timestamps: true, collection: 'sightings' },
)

sightingSchema.index({ location: '2dsphere' })
sightingSchema.index({ pet: 1, createdAt: -1 })
sightingSchema.index({ pet: 1, sightedAt: 1, _id: 1 })
sightingSchema.index({ reportedBy: 1, createdAt: -1 })
sightingSchema.index({ submissionId: 1 }, { unique: true, sparse: true })

export default mongoose.models.Sighting || mongoose.model('Sighting', sightingSchema)
