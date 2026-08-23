import mongoose from 'mongoose'

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

const sightingSchema = new mongoose.Schema(
  {
    pet: { type: mongoose.Schema.Types.ObjectId, ref: 'Pet', required: true },
    location: { type: pointSchema, required: true },
    locationName: { type: String, default: '' },
    note: { type: String, default: '' },
    photo: { type: String, default: '' },
    reporterName: { type: String, default: '' },
    reporterPhone: { type: String, default: '' },
    resolved: { type: Boolean, default: false },
  },
  { timestamps: true },
)

sightingSchema.index({ location: '2dsphere' })
sightingSchema.index({ pet: 1 })

export default mongoose.models.Sighting || mongoose.model('Sighting', sightingSchema)