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

const petSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    species: { type: String, enum: ['Dog', 'Cat', 'Other'], required: true },
    breed: { type: String, default: '' },
    photo: { type: String, default: '' },
    photos: [{ type: String }],
    description: { type: String, default: '' },
    details: { type: String, default: '' },
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
  },
  { timestamps: true },
)

// Geospatial index for $near / $geoNear queries
petSchema.index({ location: '2dsphere' })
// Compound index for species & status filtering
petSchema.index({ species: 1, status: 1 })

export default mongoose.models.Pet || mongoose.model('Pet', petSchema)