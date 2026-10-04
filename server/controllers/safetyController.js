import mongoose from 'mongoose'
import ContentReport, {
  CONTENT_REPORT_REASONS,
  CONTENT_REPORT_TARGETS,
} from '../models/ContentReport.js'
import User from '../models/User.js'
import UserBlock from '../models/UserBlock.js'
import { resolveReportTarget } from '../services/trustSafety.js'
import { setLocationPrivacyHeaders } from '../services/locationPrivacy.js'

const ALLOWED_REPORT_FIELDS = new Set(['targetType', 'targetId', 'reason', 'details'])

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.replace(/\0/g, '').trim().slice(0, maxLength) : ''
}

function validBody(body) {
  return body && typeof body === 'object' && !Array.isArray(body)
}

function publicReport(report, duplicate = false) {
  return {
    id: String(report._id),
    targetType: report.targetType,
    targetId: String(report.targetId),
    reason: report.reason,
    status: report.status,
    createdAt: report.createdAt,
    duplicate,
  }
}

export async function createContentReport(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    if (!validBody(req.body) || Object.keys(req.body).some((field) => !ALLOWED_REPORT_FIELDS.has(field))) {
      return res.status(400).json({ error: 'Invalid report request.', code: 'INVALID_REPORT_BODY' })
    }

    const targetType = cleanText(req.body.targetType, 30)
    const targetId = cleanText(req.body.targetId, 50)
    const reason = cleanText(req.body.reason, 40)
    const details = cleanText(req.body.details, 1000)
    if (!CONTENT_REPORT_TARGETS.includes(targetType) || !mongoose.isValidObjectId(targetId)) {
      return res.status(400).json({ error: 'Invalid report target.', code: 'INVALID_REPORT_TARGET' })
    }
    if (!CONTENT_REPORT_REASONS.includes(reason)) {
      return res.status(400).json({ error: 'Invalid report reason.', code: 'INVALID_REPORT_REASON' })
    }

    const target = await resolveReportTarget(targetType, targetId, req.user._id)
    if (!target) return res.status(404).json({ error: 'Report target is unavailable.', code: 'REPORT_TARGET_NOT_FOUND' })
    if (target.forbidden) return res.status(403).json({ error: 'You cannot report this item.', code: 'REPORT_TARGET_FORBIDDEN' })
    if (target.ownerId && String(target.ownerId) === String(req.user._id)) {
      return res.status(400).json({ error: 'You cannot report your own content.', code: 'SELF_REPORT' })
    }

    const filter = { reporter: req.user._id, targetType, targetId }
    const existed = Boolean(await ContentReport.exists(filter))
    const report = await ContentReport.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          ...filter,
          targetOwner: target.ownerId || null,
          reason,
          details,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )

    res.status(existed ? 200 : 201).json({ report: publicReport(report, existed) })
  } catch (error) {
    next(error)
  }
}

export async function listBlockedUsers(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    const relationships = await UserBlock.find({ blocker: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100)
    const ids = relationships.map((relationship) => relationship.blocked)
    const users = ids.length
      ? await User.find({ _id: { $in: ids } }).select('_id name avatar')
      : []
    const userById = new Map(users.map((user) => [String(user._id), user]))
    const blockedUsers = relationships.flatMap((relationship) => {
      const user = userById.get(String(relationship.blocked))
      return user
        ? [{ id: String(user._id), name: user.name, avatar: user.avatar || '', blockedAt: relationship.createdAt }]
        : []
    })
    res.json({ users: blockedUsers })
  } catch (error) {
    next(error)
  }
}

export async function blockUser(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    const userId = req.params.userId
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: 'Invalid user id.', code: 'INVALID_USER_ID' })
    }
    if (String(userId) === String(req.user._id)) {
      return res.status(400).json({ error: 'You cannot block yourself.', code: 'SELF_BLOCK' })
    }
    const user = await User.findById(userId).select('_id name avatar')
    if (!user) return res.status(404).json({ error: 'User not found.', code: 'USER_NOT_FOUND' })

    const filter = { blocker: req.user._id, blocked: user._id }
    const existed = Boolean(await UserBlock.exists(filter))
    await UserBlock.findOneAndUpdate(
      filter,
      { $setOnInsert: filter },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    res.status(existed ? 200 : 201).json({
      blocked: true,
      duplicate: existed,
      user: { id: String(user._id), name: user.name, avatar: user.avatar || '' },
    })
  } catch (error) {
    next(error)
  }
}

export async function unblockUser(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    const userId = req.params.userId
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: 'Invalid user id.', code: 'INVALID_USER_ID' })
    }
    await UserBlock.deleteOne({ blocker: req.user._id, blocked: userId })
    res.json({ blocked: false, userId: String(userId) })
  } catch (error) {
    next(error)
  }
}
