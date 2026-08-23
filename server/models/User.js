import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  phone: { type: String, default: '' },
  avatar: {
    type: String,
    default: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
  },
  role: { type: String, enum: ['user', 'shelter_admin'], default: 'user' },
  createdAt: { type: Date, default: Date.now },
})

export default mongoose.models.User || mongoose.model('User', userSchema)
