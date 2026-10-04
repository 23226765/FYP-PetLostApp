export type ReportTargetType = 'pet' | 'sighting' | 'stray' | 'comment' | 'message' | 'user'
export type ReportReason = 'spam' | 'scam' | 'harassment' | 'unsafe' | 'misinformation' | 'other'

export interface ContentReportResult {
  id: string
  targetType: ReportTargetType
  targetId: string
  reason: ReportReason
  status: 'pending' | 'reviewed' | 'dismissed' | 'actioned'
  createdAt: string
  duplicate: boolean
}

export interface BlockedUser {
  id: string
  name: string
  avatar: string
  blockedAt: string
}

export type ModerationReportStatus = 'pending' | 'reviewed' | 'dismissed' | 'actioned'
export type ContentModerationStatus = 'visible' | 'hidden'

export interface ModerationPublicAccount {
  id: string
  name: string
  avatar: string
  role: 'user' | 'shelter_admin'
}

export interface ModerationTargetPreview {
  id: string
  type: ReportTargetType
  available: boolean
  title: string
  subtitle: string
  excerpt: string
  photo: string
  relatedId?: string
  moderatable?: boolean
  moderation?: {
    status: ContentModerationStatus
    reason: string
    moderatedAt: string | null
    moderatedBy: ModerationPublicAccount | null
  } | null
}

export interface ModeratedContentResult {
  id: string
  type: 'pet' | 'sighting' | 'stray' | 'comment'
  moderation: NonNullable<ModerationTargetPreview['moderation']>
}

export interface ModerationReport {
  id: string
  targetType: ReportTargetType
  targetId: string
  reason: ReportReason
  details: string
  status: ModerationReportStatus
  createdAt: string
  updatedAt: string
  reporter: ModerationPublicAccount | null
  targetOwner: ModerationPublicAccount | null
  target: ModerationTargetPreview
  review: {
    note: string
    reviewedAt: string | null
    reviewedBy: ModerationPublicAccount | null
  }
}

export interface ModerationReportPage {
  reports: ModerationReport[]
  pagination: { page: number; limit: number; total: number }
}
