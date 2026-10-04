import mongoose from 'mongoose'
import { moderationFields } from './moderationFields.js'

const strayCommentSchema = new mongoose.Schema(
  {
    stray: { type: mongoose.Schema.Types.ObjectId, ref: 'Stray', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: 500 },
    ...moderationFields,
    submissionId: { type: String, trim: true, maxlength: 100, default: undefined },
    seedBatch: { type: String, default: undefined, select: false, immutable: true },
  },
  { timestamps: true, collection: 'straycomments' },
)

strayCommentSchema.index({ stray: 1, createdAt: -1 })
strayCommentSchema.index(
  { author: 1, submissionId: 1 },
  { name: 'stray_comment_idempotency_v2', unique: true, partialFilterExpression: { submissionId: { $type: 'string' } } },
)

export default mongoose.models.StrayComment || mongoose.model('StrayComment', strayCommentSchema)
