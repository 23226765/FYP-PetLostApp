import mongoose from 'mongoose'
import ContentReport, {
  CONTENT_REPORT_TARGETS,
} from '../models/ContentReport.js'
import Message from '../models/Message.js'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import Stray from '../models/Stray.js'
import StrayComment from '../models/StrayComment.js'
import User from '../models/User.js'
import { setLocationPrivacyHeaders } from '../services/locationPrivacy.js'
import { targetEvidenceReferences, evidenceImageUrl } from '../services/moderationEvidence.js'

export const MODERATION_REPORT_STATUSES = Object.freeze([
  'pending',
  'reviewed',
  'dismissed',
  'actioned',
])
export const MODERATABLE_CONTENT_TYPES = Object.freeze([
  'pet',
  'sighting',
  'stray',
  'comment',
])

const ALLOWED_UPDATE_FIELDS = new Set(['status', 'note'])
const ALLOWED_VISIBILITY_FIELDS = new Set(['moderationStatus', 'reason'])
const MODERATABLE_MODELS = Object.freeze({
  pet: Pet,
  sighting: Sighting,
  stray: Stray,
  comment: StrayComment,
})

function text(value, maxLength = 1000) {
  return typeof value === 'string' ? value.replace(/\0/g, '').trim().slice(0, maxLength) : ''
}

function objectId(value) {
  const id = value?._id ?? value?.id ?? value
  return mongoose.isValidObjectId(id) ? String(id) : ''
}

function publicAccount(user) {
  return user
    ? {
        id: objectId(user),
        name: user.name || '',
        avatar: user.avatar || '',
        role: user.role === 'shelter_admin' ? 'shelter_admin' : 'user',
      }
    : null
}

function unavailablePreview(targetType, targetId) {
  return {
    id: String(targetId),
    type: targetType,
    available: false,
    title: '',
    subtitle: '',
    excerpt: '',
    photo: '',
    moderatable: false,
    moderation: null,
  }
}

function moderationState(content, moderatorById) {
  return {
    status: content?.moderationStatus === 'hidden' ? 'hidden' : 'visible',
    reason: content?.moderationReason || '',
    moderatedAt: content?.moderatedAt || null,
    moderatedBy: publicAccount(moderatorById.get(objectId(content?.moderatedBy))),
  }
}

async function targetPreviews(reports) {
  const idsByType = new Map(CONTENT_REPORT_TARGETS.map((type) => [type, []]))
  for (const report of reports) idsByType.get(report.targetType)?.push(report.targetId)

  const [pets, sightings, strays, comments, messages, users] = await Promise.all([
    Pet.find({ _id: { $in: idsByType.get('pet') } })
      .select('_id name species breed district status photo photos moderationStatus +moderationReason +moderatedBy +moderatedAt')
      .lean(),
    Sighting.find({ _id: { $in: idsByType.get('sighting') } })
      .select('_id pet note photo sightedAt moderationStatus +moderationReason +moderatedBy +moderatedAt')
      .lean(),
    Stray.find({ _id: { $in: idsByType.get('stray') } })
      .select('_id species animalType district rescueStatus description photo photos active moderationStatus +moderationReason +moderatedBy +moderatedAt')
      .lean(),
    StrayComment.find({ _id: { $in: idsByType.get('comment') } })
      .select('_id stray text moderationStatus +moderationReason +moderatedBy +moderatedAt')
      .lean(),
    Message.find({ _id: { $in: idsByType.get('message') } })
      .select('_id pet text photo')
      .lean(),
    User.find({ _id: { $in: idsByType.get('user') } })
      .select('_id name avatar role')
      .lean(),
  ])

  const moderatorIds = [...new Set(
    [...pets, ...sightings, ...strays, ...comments]
      .map((content) => objectId(content.moderatedBy))
      .filter(Boolean),
  )]
  const moderators = moderatorIds.length
    ? await User.find({ _id: { $in: moderatorIds } }).select('_id name avatar role').lean()
    : []
  const moderatorById = new Map(
    moderators.map((moderator) => [String(moderator._id), moderator]),
  )

  const previews = new Map()
  for (const pet of pets) {
    previews.set(`pet:${pet._id}`, {
      id: String(pet._id), type: 'pet', available: true,
      title: pet.name || '',
      subtitle: [pet.species, pet.breed, pet.district, pet.status].filter(Boolean).join(' · '),
      excerpt: '', photo: pet.photo || '', moderatable: true,
      moderation: moderationState(pet, moderatorById), imageCount: targetEvidenceReferences(pet, 'pet').length,
    })
  }
  for (const sighting of sightings) {
    previews.set(`sighting:${sighting._id}`, {
      id: String(sighting._id), type: 'sighting', available: true,
      title: 'Sighting report', subtitle: '', excerpt: text(sighting.note, 240),
      photo: sighting.photo || '', relatedId: objectId(sighting.pet), moderatable: true,
      moderation: moderationState(sighting, moderatorById),
    })
  }
  for (const stray of strays) {
    previews.set(`stray:${stray._id}`, {
      id: String(stray._id), type: 'stray', available: stray.active !== false,
      title: stray.animalType || stray.species || '',
      subtitle: [stray.district, stray.rescueStatus].filter(Boolean).join(' · '),
      excerpt: text(stray.description, 240), photo: stray.photo || '', moderatable: true,
      moderation: moderationState(stray, moderatorById), imageCount: targetEvidenceReferences(stray, 'stray').length,
    })
  }
  for (const comment of comments) {
    previews.set(`comment:${comment._id}`, {
      id: String(comment._id), type: 'comment', available: true,
      title: 'Comment', subtitle: '', excerpt: text(comment.text, 240), photo: '',
      relatedId: objectId(comment.stray), moderatable: true,
      moderation: moderationState(comment, moderatorById),
    })
  }
  for (const message of messages) {
    previews.set(`message:${message._id}`, {
      id: String(message._id), type: 'message', available: true,
      title: 'Message', subtitle: '', excerpt: text(message.text, 240),
      photo: message.photo || '', relatedId: objectId(message.pet),
      moderatable: false, moderation: null,
    })
  }
  for (const user of users) {
    previews.set(`user:${user._id}`, {
      id: String(user._id), type: 'user', available: true,
      title: user.name || '', subtitle: user.role === 'shelter_admin' ? 'Shelter administrator' : 'Community member',
      excerpt: '', photo: user.avatar || '', moderatable: false, moderation: null,
    })
  }
  return previews
}

async function serializeReports(reports) {
  const accountIds = new Set()
  for (const report of reports) {
    for (const value of [report.reporter, report.targetOwner, report.reviewedBy]) {
      const id = objectId(value)
      if (id) accountIds.add(id)
    }
  }
  const [accounts, previews] = await Promise.all([
    accountIds.size
      ? User.find({ _id: { $in: [...accountIds] } }).select('_id name avatar role').lean()
      : [],
    targetPreviews(reports),
  ])
  const accountById = new Map(accounts.map((account) => [String(account._id), account]))

  return reports.map((report) => {
    const preview = previews.get(`${report.targetType}:${objectId(report.targetId)}`) || unavailablePreview(report.targetType, report.targetId)
    const count = preview.imageCount ?? (preview.photo ? 1 : 0)
    const evidenceImages = Array.from({ length: count }, (_, index) => evidenceImageUrl(objectId(report), index))
    return ({
    id: objectId(report),
    targetType: report.targetType,
    targetId: objectId(report.targetId),
    reason: report.reason,
    details: report.details || '',
    status: report.status,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    reporter: publicAccount(accountById.get(objectId(report.reporter))),
    targetOwner: publicAccount(accountById.get(objectId(report.targetOwner))),
    target: { ...preview, photo: evidenceImages[0] || '', evidenceImages },
    review: {
      note: report.moderatorNote || '',
      reviewedAt: report.reviewedAt || null,
      reviewedBy: publicAccount(accountById.get(objectId(report.reviewedBy))),
    },
  }) })
}

function positiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback
}

export async function listModerationReports(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    const status = text(req.query.status, 20) || 'pending'
    const targetType = text(req.query.targetType, 20)
    if (status !== 'all' && !MODERATION_REPORT_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid report status.', code: 'INVALID_REPORT_STATUS' })
    }
    if (targetType && !CONTENT_REPORT_TARGETS.includes(targetType)) {
      return res.status(400).json({ error: 'Invalid report target type.', code: 'INVALID_REPORT_TARGET' })
    }

    const page = positiveInteger(req.query.page, 1, 100000)
    const limit = positiveInteger(req.query.limit, 20, 50)
    const filter = {
      ...(status === 'all' ? {} : { status }),
      ...(targetType ? { targetType } : {}),
    }
    const [reports, total] = await Promise.all([
      ContentReport.find(filter)
        .select('+targetOwner +moderatorNote +reviewedBy')
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ContentReport.countDocuments(filter),
    ])
    res.json({ reports: await serializeReports(reports), pagination: { page, limit, total } })
  } catch (error) {
    next(error)
  }
}

export async function updateModerationReport(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
      || Object.keys(req.body).some((field) => !ALLOWED_UPDATE_FIELDS.has(field))) {
      return res.status(400).json({ error: 'Invalid moderation request.', code: 'INVALID_MODERATION_BODY' })
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid report id.', code: 'INVALID_REPORT_ID' })
    }
    const status = text(req.body.status, 20)
    if (!MODERATION_REPORT_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid report status.', code: 'INVALID_REPORT_STATUS' })
    }
    if (typeof req.body.note !== 'undefined' && typeof req.body.note !== 'string') {
      return res.status(400).json({ error: 'Invalid moderator note.', code: 'INVALID_MODERATOR_NOTE' })
    }

    const report = await ContentReport.findById(req.params.id)
      .select('+targetOwner +moderatorNote +reviewedBy')
    if (!report) return res.status(404).json({ error: 'Report not found.', code: 'REPORT_NOT_FOUND' })

    report.status = status
    report.moderatorNote = text(req.body.note, 1000)
    report.reviewedBy = req.user._id
    report.reviewedAt = new Date()
    await report.save()

    const [serialized] = await serializeReports([
      typeof report.toObject === 'function' ? report.toObject() : report,
    ])
    res.json({ report: serialized })
  } catch (error) {
    next(error)
  }
}

export async function updateContentVisibility(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    if (
      !req.body
      || typeof req.body !== 'object'
      || Array.isArray(req.body)
      || Object.keys(req.body).some((field) => !ALLOWED_VISIBILITY_FIELDS.has(field))
    ) {
      return res.status(400).json({
        error: 'Invalid content visibility request.',
        code: 'INVALID_VISIBILITY_BODY',
      })
    }

    const targetType = text(req.params.targetType, 20)
    if (!MODERATABLE_CONTENT_TYPES.includes(targetType)) {
      return res.status(400).json({
        error: 'This content type does not support visibility moderation.',
        code: 'UNSUPPORTED_VISIBILITY_TARGET',
      })
    }
    if (!mongoose.isValidObjectId(req.params.targetId)) {
      return res.status(400).json({ error: 'Invalid content id.', code: 'INVALID_CONTENT_ID' })
    }

    const moderationStatus = text(req.body.moderationStatus, 20)
    if (!['visible', 'hidden'].includes(moderationStatus)) {
      return res.status(400).json({
        error: 'Invalid content visibility.',
        code: 'INVALID_VISIBILITY_STATUS',
      })
    }
    let reason = text(req.body.reason, 1000)
    if (moderationStatus === 'hidden' && !reason) {
      return res.status(400).json({
        error: 'An internal reason is required to hide content.',
        code: 'MODERATION_REASON_REQUIRED',
      })
    }
    if (!reason) reason = 'Restored by shelter administrator.'

    const Model = MODERATABLE_MODELS[targetType]
    const content = await Model.findById(req.params.targetId)
      .select('+moderationReason +moderatedBy +moderatedAt')
    if (!content) {
      return res.status(404).json({ error: 'Content not found.', code: 'CONTENT_NOT_FOUND' })
    }

    content.moderationStatus = moderationStatus
    content.moderationReason = reason
    content.moderatedBy = req.user._id
    content.moderatedAt = new Date()
    await content.save()

    res.json({
      content: {
        id: String(content._id),
        type: targetType,
        moderation: {
          status: moderationStatus,
          reason,
          moderatedAt: content.moderatedAt,
          moderatedBy: publicAccount(req.user),
        },
      },
    })
  } catch (error) {
    next(error)
  }
}
