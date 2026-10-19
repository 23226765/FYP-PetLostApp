import mongoose from 'mongoose'
import { isContentVisible } from './moderationVisibility.js'

const id = (value) => String(value?._id ?? value ?? '').toLowerCase()
export function submissionConflict() {
  return Object.assign(new Error('Submission ID was already used for different content.'), { status: 409, code: 'SUBMISSION_CONFLICT' })
}
export function assertCommentReplay(doc, values) {
  if (!isContentVisible(doc)) throw Object.assign(new Error('Comment unavailable.'), { status: 404 })
  if (id(doc.stray) !== id(values.stray) || doc.text !== values.text) throw submissionConflict()
}
export function assertMessageReplay(doc, values, imageIds) {
  if (id(doc.pet) !== id(values.pet) || id(doc.participant) !== id(values.participant)
    || (doc.text || '') !== values.text || id(doc.sharedStray) !== id(values.sharedStray)
    || (doc.imageIds || []).map(id).join(',') !== imageIds.map(id).join(',')
    || (doc.photo && !(doc.imageIds || []).length)) throw submissionConflict()
}

/** Validate the actual atomic winner, including duplicate-key race recovery. */
export async function upsertSubmission(Model, filter, values, validate) {
  const candidateId = new mongoose.Types.ObjectId()
  const timestamp = new Date()
  let doc
  try {
    // Existing winners (including hidden/conflicting rows) must remain intact.
    // Disable Mongoose's automatic updatedAt write and timestamp inserts only.
    doc = await Model.findOneAndUpdate(filter, { $setOnInsert: { ...values, _id: candidateId, createdAt: timestamp, updatedAt: timestamp } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true, timestamps: false }).select('+imageIds +moderationStatus')
  } catch (error) {
    if (error.code !== 11000) throw error
    doc = await Model.findOne(filter).select('+imageIds +moderationStatus')
    if (!doc) throw error
  }
  validate(doc)
  return { doc, duplicate: id(doc) !== id(candidateId) }
}
