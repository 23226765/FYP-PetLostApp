import mongoose from 'mongoose'

export const CONTENT_REPORT_TARGETS = Object.freeze([
  'pet',
  'sighting',
  'stray',
  'comment',
  'message',
  'user',
])

export const CONTENT_REPORT_REASONS = Object.freeze([
  'spam',
  'scam',
  'harassment',
  'unsafe',
  'misinformation',
  'other',
])

const contentReportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: CONTENT_REPORT_TARGETS, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    targetOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, select: false },
    reason: { type: String, enum: CONTENT_REPORT_REASONS, required: true },
    details: { type: String, trim: true, maxlength: 1000, default: '' },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'dismissed', 'actioned'],
      default: 'pending',
    },
    moderatorNote: { type: String, trim: true, maxlength: 1000, default: '', select: false },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      select: false,
    },
    reviewedAt: { type: Date, default: null },
    seedBatch: { type: String, default: undefined, select: false, immutable: true },
  },
  { timestamps: true, collection: 'contentreports' },
)

contentReportSchema.index(
  { reporter: 1, targetType: 1, targetId: 1 },
  { unique: true, name: 'content_report_once_per_reporter_target' },
)
contentReportSchema.index({ status: 1, createdAt: -1 })
contentReportSchema.index({ targetType: 1, targetId: 1 })

export default mongoose.models.ContentReport || mongoose.model('ContentReport', contentReportSchema)
