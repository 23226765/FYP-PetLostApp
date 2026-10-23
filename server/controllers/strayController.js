import mongoose from 'mongoose'
import { commitContentImages, rejectImageStrings, validateImageIds } from '../services/mediaAttachments.js'
import Notification from '../models/Notification.js'
import SavedStray from '../models/SavedStray.js'
import Stray from '../models/Stray.js'
import StrayComment from '../models/StrayComment.js'
import User from '../models/User.js'
import { serializeContact } from '../services/contactPrivacy.js'
import { blockedUserIdsFor, usersBlockEachOther } from '../services/trustSafety.js'
import { visibleContentFilter } from '../services/moderationVisibility.js'
import { assertCommentReplay, upsertSubmission } from '../services/submissionIdentity.js'
import {
  anonymousSearchCoordinates,
  exactDistanceKm,
  projectStrayLocation,
  projectedDistanceKm,
  setLocationPrivacyHeaders,
} from '../services/locationPrivacy.js'

const SPECIES = new Set(['Dog', 'Cat', 'Other'])
const CONDITIONS = new Set(['unknown', 'healthy', 'injured', 'critical'])
const RESCUE_STATUSES = new Set(['reported', 'rescue_dispatched', 'rescued'])
const HK_DISTRICTS = new Set([
  'Central and Western', 'Eastern', 'Southern', 'Wan Chai', 'Kowloon City',
  'Kwun Tong', 'Sham Shui Po', 'Wong Tai Sin', 'Yau Tsim Mong', 'Islands',
  'Kwai Tsing', 'North', 'Sai Kung', 'Sha Tin', 'Tai Po', 'Tsuen Wan',
  'Tuen Mun', 'Yuen Long',
])
const ACTIVE_FILTER = visibleContentFilter({ active: { $ne: false } })

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.replace(/\0/g, '').trim().slice(0, maxLength) : ''
}

function animalName(species, animalType) {
  return species === 'Other' ? cleanText(animalType, 80) || 'animal' : String(species || 'animal')
}

function validCoordinates(value) {
  return Array.isArray(value) && value.length === 2 && value.every((item) => Number.isFinite(Number(item))) &&
    Number(value[0]) >= -180 && Number(value[0]) <= 180 && Number(value[1]) >= -90 && Number(value[1]) <= 90
}

function validPhotoUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.startsWith('blob:')) return false
  if (/^data:image\/(?:jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(value)) return value.length <= 10_000_000
  if (/^\/api\/uploads\/managed\/[a-f0-9]{24}\/content$/i.test(value)) return true
  if (value.startsWith('/uploads/')) return true
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
}

function hasBody(req) {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body) && Object.keys(req.body).length > 0
}

function queryFilter(query) {
  const filter = { ...ACTIVE_FILTER }
  if (query.species && SPECIES.has(query.species)) filter.species = query.species
  if (query.condition && CONDITIONS.has(query.condition)) filter.condition = query.condition
  if (query.status && RESCUE_STATUSES.has(query.status)) filter.rescueStatus = query.status
  if (query.district && HK_DISTRICTS.has(query.district)) filter.district = query.district
  return filter
}

function pagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 20))
  return { page, limit, skip: (page - 1) * limit }
}

function publicAuthor(user, fallbackName = 'Community reporter') {
  return {
    id: user?._id ? String(user._id) : undefined,
    name: cleanText(user?.name || fallbackName, 100) || 'Community reporter',
    avatar: validPhotoUrl(user?.avatar) ? user.avatar : '',
  }
}

function relativeTime(date) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

async function contextFor(strays, requester, { includeContact = true } = {}) {
  const strayIds = strays.map((stray) => stray._id)
  const authorIds = [...new Set(strays.map((stray) => String(stray.reportedBy || '')).filter(Boolean))]
  const blocked = requester ? await blockedUserIdsFor(requester._id) : new Set()
  const commentFilter = visibleCommentFilter({ stray: { $in: strayIds } }, blocked)
  const [authors, commentCounts, commentPreviews, saved] = await Promise.all([
    User.find({ _id: { $in: authorIds } }).select(
      includeContact ? '_id name avatar phone privacy.contactVisibility' : '_id name avatar',
    ),
    StrayComment.aggregate([
      { $match: commentFilter },
      { $group: { _id: '$stray', count: { $sum: 1 } } },
    ]),
    StrayComment.aggregate([
      { $match: commentFilter },
      { $sort: { createdAt: -1, _id: -1 } },
      { $group: { _id: '$stray', text: { $first: '$text' } } },
    ]),
    requester ? SavedStray.find({ user: requester._id, stray: { $in: strayIds } }).select('stray') : [],
  ])
  return {
    authors: new Map(authors.map((author) => [String(author._id), author])),
    counts: new Map(commentCounts.map((item) => [String(item._id), item.count])),
    previews: new Map(commentPreviews.map((item) => [String(item._id), item.text])),
    saved: new Set(saved.map((item) => String(item.stray))),
    blocked,
  }
}

function serializeStray(
  stray,
  requester,
  context,
  distanceMeters,
  { includeContact = true, distanceOrigin, forcePublic = false } = {},
) {
  const id = String(stray._id)
  const author = context.authors.get(String(stray.reportedBy || ''))
  const authorSummary = publicAuthor(author, stray.reporterName)
  const photos = [...new Set([...(stray.photos || []), stray.photo].filter(validPhotoUrl))]
  const projectedLocation = projectStrayLocation(stray, requester, { forcePublic })
  const distanceKm = projectedLocation.locationPrecision === 'exact'
    ? exactDistanceKm(distanceMeters)
    : projectedDistanceKm(distanceOrigin, projectedLocation.coordinates)
  return {
    id, species: stray.species, animalType: cleanText(stray.animalType, 80), description: stray.description, photo: photos[0] || '', photos,
    condition: stray.condition, district: stray.district, location: projectedLocation.location,
    coordinates: projectedLocation.coordinates, locationPrecision: projectedLocation.locationPrecision, rescueStatus: stray.rescueStatus,
    author: authorSummary, reporterName: authorSummary.name,
    ...(includeContact
      ? serializeContact({
          requester: forcePublic ? null : requester,
          contactOwner: author,
          phoneField: 'reporterPhone',
          contextAllowed: !context.blocked.has(String(stray.reportedBy || '')),
        })
      : { canViewContact: false }),
    reportedBy: stray.reportedBy ? String(stray.reportedBy) : undefined,
    interactionBlocked: context.blocked.has(String(stray.reportedBy || '')),
    reportedAgo: relativeTime(stray.createdAt), observedAt: stray.observedAt || stray.createdAt,
    createdAt: stray.createdAt, updatedAt: stray.updatedAt, statusUpdatedAt: stray.statusUpdatedAt,
    commentCount: context.counts.get(id) || 0, isSaved: context.saved.has(id),
    commentPreview: context.previews.get(id) || undefined,
    canManage: Boolean(!forcePublic && requester && String(stray.reportedBy) === String(requester._id)),
    canEdit: Boolean(!forcePublic && requester && String(stray.reportedBy) === String(requester._id)),
    canDelete: Boolean(!forcePublic && requester && String(stray.reportedBy) === String(requester._id)),
    canUpdateStatus: Boolean(!forcePublic && requester && (String(stray.reportedBy) === String(requester._id) || requester.role === 'shelter_admin')),
    distanceKm,
  }
}

async function serializeMany(strays, requester, distanceFor, options) {
  if (!strays.length) return []
  const context = await contextFor(strays, requester, options)
  return strays.map((stray) => serializeStray(stray, requester, context, distanceFor?.(stray), options))
}

async function findNewest(filter, { skip = 0, limit = 20 } = {}) {
  return Stray.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
}

export async function listStrays(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    const filter = queryFilter(req.query); const { page, limit, skip } = pagination(req.query)
    const [strays, total] = await Promise.all([findNewest(filter, { skip, limit }), Stray.countDocuments(filter)])
    res.json({ strays: await serializeMany(strays, req.user), pagination: { page, limit, total, hasMore: skip + strays.length < total } })
  } catch (error) { next(error) }
}

export async function listMyStrays(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    const filter = { ...ACTIVE_FILTER, reportedBy: req.user._id }
    const { page, limit, skip } = pagination(req.query)
    const [strays, total] = await Promise.all([
      findNewest(filter, { skip, limit }),
      Stray.countDocuments(filter),
    ])
    res.json({
      strays: await serializeMany(strays, req.user, undefined, { includeContact: false }),
      pagination: { page, limit, total, hasMore: skip + strays.length < total },
    })
  } catch (error) { next(error) }
}

export async function nearbyStrays(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    const lat = Number(req.query.lat); const lng = Number(req.query.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return res.status(400).json({ error: 'Valid `lat` and `lng` are required.' })
    const radiusKm = Math.min(50, Math.max(1, Number(req.query.radiusKm) || 5))
    const searchCoordinates = anonymousSearchCoordinates(req.user, [lng, lat])
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50))
    const pipeline = [{ $geoNear: { near: { type: 'Point', coordinates: searchCoordinates }, distanceField: 'distanceMeters', maxDistance: radiusKm * 1000, spherical: true, key: 'location', query: queryFilter(req.query) } }, { $sort: { distanceMeters: 1 } }, { $limit: limit }]
    const strays = await Stray.aggregate(pipeline)
    res.json({ strays: await serializeMany(strays, req.user, (stray) => stray.distanceMeters, { distanceOrigin: searchCoordinates }) })
  } catch (error) { next(error) }
}

export async function getStray(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid stray report id' })
    const stray = await Stray.findOne({ _id: req.params.id, ...ACTIVE_FILTER })
    if (!stray) return res.status(404).json({ error: 'Stray report not found' })
    const [serialized] = await serializeMany([stray], req.user, undefined, {
      forcePublic: req.query?.view === 'public',
    })
    res.json({ stray: serialized })
  } catch (error) { next(error) }
}

export async function reportStray(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    if (!hasBody(req)) return res.status(400).json({ success: false, message: 'Invalid or missing request body' })
    rejectImageStrings(req.body)
    const { species, condition = 'unknown', district, locationName, coordinates, submissionId } = req.body
    const animalType = cleanText(req.body.animalType, 80)
    const description = cleanText(req.body.description, 2000)
    const imageIds = validateImageIds(req.body.imageIds === undefined ? [] : req.body.imageIds, 'stray')
    const observedAt = new Date(req.body.observedAt || Date.now())
    if (!SPECIES.has(species) || !description) return res.status(400).json({ error: 'Species and description are required.' })
    if (species === 'Other' && !animalType) return res.status(400).json({ error: 'Please specify what type of animal was seen.' })
    if (!CONDITIONS.has(condition) || !HK_DISTRICTS.has(district) || !cleanText(locationName, 200)) return res.status(400).json({ error: 'Valid condition, district, and location are required.' })
    if (!validCoordinates(coordinates)) return res.status(400).json({ error: '`coordinates` must be [lng, lat].', code: 'LOCATION_INVALID' })
    if (!imageIds.length) return res.status(400).json({ error: 'At least one uploaded image is required.', code: 'IMAGE_IDS_REQUIRED' })
    if (Number.isNaN(observedAt.getTime()) || observedAt.getTime() > Date.now() + 300000) return res.status(400).json({ error: 'Observed time is invalid.', code: 'OBSERVED_TIME_INVALID' })
    const safeSubmissionId = cleanText(submissionId, 100)
    if (!safeSubmissionId) return res.status(400).json({ error: 'A submissionId is required.' })

    const filter = { reportedBy: req.user._id, submissionId: safeSubmissionId }
    const { doc: stray, duplicate: existed } = await commitContentImages({ Model: Stray, type: 'stray', purpose: 'stray', userId: req.user._id,
      imageIds, minimum: 1, idempotencyFilter: filter,
      values: { species, animalType: species === 'Other' ? animalType : '', description, condition, district,
        locationName: cleanText(locationName, 200), location: { type: 'Point', coordinates: coordinates.map(Number) },
        reporterName: req.user.name, reporterPhone: req.user.phone || '', reportedBy: req.user._id, observedAt,
        rescueStatus: RESCUE_STATUSES.has(req.body.rescueStatus) ? req.body.rescueStatus : 'reported', submissionId: safeSubmissionId } })
    const [serialized] = await serializeMany([stray], req.user)
    res.status(existed ? 200 : 201).json({ stray: serialized, duplicate: existed })
  } catch (error) { next(error) }
}

export async function updateStray(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    if (!mongoose.isValidObjectId(req.params.id) || !hasBody(req)) return res.status(400).json({ error: 'Invalid request.' })
    rejectImageStrings(req.body)
    const stray = await Stray.findOne({ _id: req.params.id, ...ACTIVE_FILTER })
    if (!stray) return res.status(404).json({ error: 'Stray report not found' })
    if (String(stray.reportedBy) !== String(req.user._id)) return res.status(403).json({ error: 'Only the author can edit this post.' })
    const description = cleanText(req.body.description, 2000)
    if (!description) return res.status(400).json({ error: 'Description is required.', code: 'FIELD_REQUIRED', field: 'description' })
    if (req.body.species && !SPECIES.has(req.body.species)) return res.status(400).json({ error: 'Invalid species.' })
    if (req.body.condition && !CONDITIONS.has(req.body.condition)) return res.status(400).json({ error: 'Invalid condition.' })
    const nextSpecies = req.body.species || stray.species
    const nextAnimalType = req.body.animalType === undefined ? cleanText(stray.animalType, 80) : cleanText(req.body.animalType, 80)
    if (nextSpecies === 'Other' && !nextAnimalType) return res.status(400).json({ error: 'Please specify what type of animal was seen.' })
    stray.description = description
    if (req.body.species) stray.species = req.body.species
    stray.animalType = nextSpecies === 'Other' ? nextAnimalType : ''
    if (req.body.condition) stray.condition = req.body.condition
    let saved = stray
    if (Object.hasOwn(req.body, 'imageIds')) {
      saved = (await commitContentImages({ Model: Stray, type: 'stray', purpose: 'stray', userId: req.user._id,
        existingId: stray._id, imageIds: req.body.imageIds, minimum: 1,
        values: { description: stray.description, species: stray.species, animalType: stray.animalType, condition: stray.condition } })).doc
    } else {
      saved = await Stray.findOneAndUpdate(
        { _id: stray._id, reportedBy: req.user._id, ...ACTIVE_FILTER },
        { $set: { description: stray.description, species: stray.species, animalType: stray.animalType, condition: stray.condition } },
        { new: true, runValidators: true },
      )
      if (!saved) return res.status(404).json({ error: 'Stray report not found' })
    }
    const [serialized] = await serializeMany([saved], req.user)
    res.json({ stray: serialized })
  } catch (error) { next(error) }
}

export async function deleteStray(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid stray report id' })
    const stray = await Stray.findOne({ _id: req.params.id, ...ACTIVE_FILTER })
    if (!stray) return res.status(404).json({ error: 'Stray report not found' })
    if (String(stray.reportedBy) !== String(req.user._id)) return res.status(403).json({ error: 'Only the author can delete this post.' })
    stray.active = false; await stray.save(); res.json({ success: true })
  } catch (error) { next(error) }
}

export async function updateRescueStatus(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    if (!mongoose.isValidObjectId(req.params.id) || !RESCUE_STATUSES.has(req.body?.status)) return res.status(400).json({ error: 'Invalid rescue status.' })
    const stray = await Stray.findOne({ _id: req.params.id, ...ACTIVE_FILTER })
    if (!stray) return res.status(404).json({ error: 'Stray report not found' })
    if (String(stray.reportedBy) !== String(req.user._id) && req.user.role !== 'shelter_admin') return res.status(403).json({ error: 'Only the reporter or a shelter admin can update this report.' })
    stray.rescueStatus = req.body.status; stray.statusUpdatedAt = new Date(); await stray.save()
    const [serialized] = await serializeMany([stray], req.user); res.json({ stray: serialized })
  } catch (error) { next(error) }
}

function serializeComment(comment) {
  return { id: String(comment._id), strayId: String(comment.stray), text: comment.text, author: publicAuthor(comment.author), createdAt: comment.createdAt, updatedAt: comment.updatedAt }
}

function visibleCommentFilter(base, blocked) {
  return visibleContentFilter({ ...base, ...(blocked.size ? {
    // Aggregations do not perform Mongoose's normal query ObjectId casting.
    author: { $nin: [...blocked].map((id) => new mongoose.Types.ObjectId(String(id))) },
  } : {}) })
}

export async function listComments(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid stray report id' })
    if (!await Stray.exists({ _id: req.params.id, ...ACTIVE_FILTER })) return res.status(404).json({ error: 'Stray report not found' })
    const { page, limit, skip } = pagination(req.query)
    const blocked = req.user ? await blockedUserIdsFor(req.user._id) : new Set()
    const filter = visibleCommentFilter({ stray: req.params.id }, blocked)
    const [comments, total] = await Promise.all([StrayComment.find(filter).populate('author', 'name avatar').sort({ createdAt: 1, _id: 1 }).skip(skip).limit(limit), StrayComment.countDocuments(filter)])
    res.json({ comments: comments.map(serializeComment), pagination: { page, limit, total, hasMore: skip + comments.length < total } })
  } catch (error) { next(error) }
}

export async function createComment(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    const text = cleanText(req.body?.text, 501); const submissionId = cleanText(req.body?.submissionId, 101)
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid stray report id' })
    if (!text || text.length > 500 || !submissionId || submissionId.length > 100) return res.status(400).json({ error: 'Comment must be between 1 and 500 characters and include submissionId.', code: 'COMMENT_INVALID', params: { max: 500 } })
    const stray = await Stray.findOne({ _id: req.params.id, ...ACTIVE_FILTER })
    if (!stray) return res.status(404).json({ error: 'Stray report not found' })
    if (await usersBlockEachOther(req.user._id, stray.reportedBy)) {
      return res.status(403).json({ error: 'Commenting is unavailable on this post.', code: 'USER_BLOCKED' })
    }
    const values = { stray: stray._id, author: req.user._id, text, submissionId }
    const { doc: comment, duplicate } = await upsertSubmission(StrayComment, { author: req.user._id, submissionId }, values,
      (existing) => assertCommentReplay(existing, values))
    await comment.populate('author', 'name avatar')
    if (stray.reportedBy && String(stray.reportedBy) !== String(req.user._id)) {
      await Notification.findOneAndUpdate({ user: stray.reportedBy, stray: stray._id, type: 'comment', comment: comment._id }, { $setOnInsert: { user: stray.reportedBy, stray: stray._id, comment: comment._id, type: 'comment', title: `New comment on your ${animalName(stray.species, stray.animalType).toLowerCase()} post`, body: `${req.user.name} commented: ${text.slice(0, 120)}`, photo: stray.photo || '' } }, { upsert: true, new: true })
    }
    res.status(duplicate ? 200 : 201).json({ comment: serializeComment(comment), duplicate })
  } catch (error) { next(error) }
}

export async function updateComment(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    const text = cleanText(req.body?.text, 501)
    if (!mongoose.isValidObjectId(req.params.commentId) || !text || text.length > 500) return res.status(400).json({ error: 'A comment between 1 and 500 characters is required.', code: 'COMMENT_INVALID', params: { max: 500 } })
    if (!await Stray.exists({ _id: req.params.id, ...ACTIVE_FILTER })) {
      return res.status(404).json({ error: 'Stray report not found' })
    }
    const comment = await StrayComment.findOne(
      visibleContentFilter({ _id: req.params.commentId, stray: req.params.id }),
    )
    if (!comment) return res.status(404).json({ error: 'Comment not found' })
    if (String(comment.author) !== String(req.user._id)) return res.status(403).json({ error: 'Only the comment author can edit it.' })
    comment.text = text; await comment.save(); await comment.populate('author', 'name avatar'); res.json({ comment: serializeComment(comment) })
  } catch (error) { next(error) }
}

export async function deleteComment(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    if (!await Stray.exists({ _id: req.params.id, ...ACTIVE_FILTER })) {
      return res.status(404).json({ error: 'Stray report not found' })
    }
    const comment = await StrayComment.findOne(
      visibleContentFilter({ _id: req.params.commentId, stray: req.params.id }),
    )
    if (!comment) return res.status(404).json({ error: 'Comment not found' })
    if (String(comment.author) !== String(req.user._id)) return res.status(403).json({ error: 'Only the comment author can delete it.' })
    await comment.deleteOne(); await Notification.deleteMany({ comment: comment._id }); res.json({ success: true })
  } catch (error) { next(error) }
}

export async function listSavedStrays(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    const filter = { user: req.user._id }
    const { page, limit, skip } = pagination(req.query)
    const [saves, total] = await Promise.all([
      SavedStray.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      SavedStray.countDocuments(filter),
    ])
    const strays = await Stray.find({ _id: { $in: saves.map((save) => save.stray) }, ...ACTIVE_FILTER })
    const byId = new Map(strays.map((stray) => [String(stray._id), stray])); const ordered = saves.map((save) => byId.get(String(save.stray))).filter(Boolean)
    res.json({
      strays: await serializeMany(ordered, req.user, undefined, { includeContact: false }),
      unavailableCount: saves.length - ordered.length,
      pagination: { page, limit, total, hasMore: skip + saves.length < total },
    })
  } catch (error) { next(error) }
}

export async function saveStray(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    if (!mongoose.isValidObjectId(req.params.id) || !await Stray.exists({ _id: req.params.id, ...ACTIVE_FILTER })) return res.status(404).json({ error: 'Stray report not found' })
    await SavedStray.updateOne({ user: req.user._id, stray: req.params.id }, { $setOnInsert: { user: req.user._id, stray: req.params.id } }, { upsert: true }); res.json({ saved: true })
  } catch (error) { next(error) }
}

export async function unsaveStray(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid stray report id' })
    await SavedStray.deleteOne({ user: req.user._id, stray: req.params.id }); res.json({ saved: false })
  } catch (error) { next(error) }
}
