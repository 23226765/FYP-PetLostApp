import mongoose from 'mongoose'

export const MODERATION_STATUSES = Object.freeze(['visible', 'hidden'])

/**
 * Shared, auditable visibility fields for community-authored content.
 * The reason and moderator identity are private and must be explicitly selected
 * only inside the shelter-administrator moderation workflow.
 */
export const moderationFields = {
  moderationStatus: {
    type: String,
    enum: MODERATION_STATUSES,
    default: 'visible',
  },
  moderationReason: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: '',
    select: false,
  },
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    select: false,
  },
  moderatedAt: {
    type: Date,
    default: null,
    select: false,
  },
}
