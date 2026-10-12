import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import { commitContentImages } from './mediaAttachments.js'
import { visibleContentFilter } from './moderationVisibility.js'

function conflict(status, code) {
  return Object.assign(new Error('Sighting submission is unavailable.'), { status, code })
}

// Dependency injection is for isolated/real-replica-set tests, never a separate
// production write path. Both image and photo-free reports use this transaction.
export function createSightingSubmission({ Pets = Pet, Sightings = Sighting, commit = commitContentImages } = {}) {
  return ({ petId, userId, values, imageIds = [], submissionId }, options) => commit({
    Model: Sightings, type: 'sighting', purpose: 'sighting', userId,
    values, imageIds,
    idempotencyFilter: submissionId ? { submissionId, pet: petId, reportedBy: userId } : undefined,
    authorize: async (session) => {
      const pet = await Pets.findOne(visibleContentFilter({ _id: petId })).session(session)
      if (!pet) throw conflict(404, 'PET_NOT_FOUND')
    },
    beforeCreate: async (session) => {
      // This write also makes a simultaneous reunion conflict with the
      // transaction. MongoDB retries then re-check the permitted status.
      const update = await Pets.updateOne(
        visibleContentFilter({ _id: petId, status: { $in: ['lost', 'sighted'] } }),
        // Increment the existing Mongoose version so an already-sighted pet
        // still receives a real write, rather than a potentially no-op update.
        { $set: { status: 'sighted' }, $inc: { __v: 1 } }, { session, runValidators: true },
      )
      if (update.matchedCount !== 1) throw conflict(409, 'PET_NOT_ACCEPTING_SIGHTINGS')
    },
  }, options)
}

export const commitSightingSubmission = createSightingSubmission()
