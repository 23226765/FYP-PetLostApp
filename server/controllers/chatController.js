import mongoose from 'mongoose'
import { commitContentImages, rejectImageStrings, validateImageIds } from '../services/mediaAttachments.js'
import { imageError } from '../services/imageErrors.js'
import Message from '../models/Message.js'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import User from '../models/User.js'
import Stray from '../models/Stray.js'
import Notification from '../models/Notification.js'
import {
  contactOwnerFrom,
  loadContactOwners,
  serializeContact,
} from '../services/contactPrivacy.js'
import { setLocationPrivacyHeaders } from '../services/locationPrivacy.js'
import { blockedUserIdsFor, usersBlockEachOther } from '../services/trustSafety.js'
import { visibleContentFilter } from '../services/moderationVisibility.js'
import { assertMessageReplay, upsertSubmission } from '../services/submissionIdentity.js'

const MAX_MESSAGE_LENGTH = 2000
const MAX_READ_MESSAGES = 500

function strayReferenceId(message) {
  return message.sharedStray?._id || message.sharedStray || null
}

function serializeMessage(message, strayById = new Map()) {
  const strayId = strayReferenceId(message)
  const stray = strayId ? strayById.get(String(strayId)) : null
  return {
    id: String(message._id),
    petId: String(message.pet),
    sender: message.sender,
    text: message.text,
    photo: message.photo || undefined,
    createdAt: message.createdAt,
    sharedStray: stray ? {
      id: String(stray._id),
      species: stray.species,
      animalType: stray.animalType || '',
      description: stray.description,
      photo: stray.photo || stray.photos?.[0] || '',
      location: stray.district,
      locationPrecision: 'approximate',
      district: stray.district,
      rescueStatus: stray.rescueStatus,
    } : undefined,
    sharedStrayUnavailable: Boolean(strayId && !stray),
  }
}

async function serializeMessages(messages) {
  const ids = [...new Set(messages.map(strayReferenceId).filter(Boolean).map(String))]
  const strays = ids.length
    ? await Stray.find(visibleContentFilter({
        _id: { $in: ids },
        active: { $ne: false },
      })).select('species animalType description photo photos district rescueStatus')
    : []
  const strayById = new Map(strays.map((stray) => [String(stray._id), stray]))
  return messages.map((message) => serializeMessage(message, strayById))
}

function isUnsupportedOrderByError(error) {
  return error?.code === 2 && String(error.message).includes('order-by item is excluded')
}

function isOwner(pet, userId) {
  return Boolean(pet.reportedBy) && String(pet.reportedBy) === String(userId)
}

function hasRequestBody(req) {
  return (
    req.body &&
    typeof req.body === 'object' &&
    !Array.isArray(req.body) &&
    Object.keys(req.body).length > 0
  )
}

function invalidRequestBody(res) {
  return res.status(400).json({
    success: false,
    message: 'Invalid or missing request body',
  })
}

function serializeChatPet(pet, contactOwner, requester, participant, participantName) {
  return {
    id: String(pet._id),
    name: pet.name,
    photo: pet.photo || '',
    owner: pet.ownerName || 'Pet owner',
    ...serializeContact({ requester, contactOwner, phoneField: 'ownerPhone' }),
    reportedBy: pet.reportedBy ? String(pet.reportedBy) : undefined,
    participantId: participant ? String(participant) : undefined,
    participantName: participantName || undefined,
  }
}

function participantIdForRequest(req, pet, source) {
  if (!isOwner(pet, req.user._id)) return req.user._id

  const participantId = source?.participantId
  if (!mongoose.isValidObjectId(participantId)) return null
  if (String(participantId) === String(req.user._id)) return null
  if (pet.reportedBy && String(participantId) === String(pet.reportedBy)) return null
  return participantId
}

async function findMessages(filter) {
  let messages
  try {
    messages = await Message.find(filter).sort({ createdAt: 1 })
  } catch (error) {
    if (!isUnsupportedOrderByError(error)) throw error
    messages = await Message.find(filter)
    messages.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
  }
  return messages
}

// GET /api/chat/inbox
export async function listConversations(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    const ownedPets = await Pet.find(visibleContentFilter({ reportedBy: req.user._id })).select(
      'name photo ownerName reportedBy',
    )
    const ownedPetIds = ownedPets.map((pet) => pet._id)
    const filters = [{ participant: req.user._id }]
    if (ownedPetIds.length) filters.push({ pet: { $in: ownedPetIds } })

    const messages = await findMessages({
      $and: [{ $or: filters }, { participant: { $ne: null } }],
    })
    const lastMessageByConversation = new Map()
    const messagesByConversation = new Map()
    for (const message of messages) {
      const key = `${message.pet}:${message.participant}`
      lastMessageByConversation.set(key, message)
      if (!messagesByConversation.has(key)) messagesByConversation.set(key, [])
      messagesByConversation.get(key).push(message)
    }

    const conversationKeys = [...lastMessageByConversation.keys()]
    if (!conversationKeys.length) return res.json({ conversations: [] })

    const petIds = [...new Set(messages.map((message) => String(message.pet)))]
    const participantIds = [
      ...new Set(messages.map((message) => String(message.participant)).filter(Boolean)),
    ]

    const pets = await Pet.find(visibleContentFilter({ _id: { $in: petIds } })).select(
      'name photo ownerName reportedBy',
    )
    const petById = new Map(pets.map((pet) => [String(pet._id), pet]))
    const contactOwners = await loadContactOwners(pets)
    const participants = await User.find({ _id: { $in: participantIds } }).select('name')
    const participantNameById = new Map(
      participants.map((participant) => [String(participant._id), participant.name]),
    )
    const serializedLastMessages = new Map((await serializeMessages([...lastMessageByConversation.values()])).map((message) => [message.id, message]))
    const blockedUserIds = await blockedUserIdsFor(req.user._id)
    const conversations = conversationKeys
      .map((conversationId) => {
        const lastMessage = lastMessageByConversation.get(conversationId)
        if (!lastMessage) return null
        const petId = String(lastMessage.pet)
        const participantId = String(lastMessage.participant)
        const pet = petById.get(petId)
        if (!pet) return null
        const otherUserId = isOwner(pet, req.user._id) ? participantId : String(pet.reportedBy || '')
        if (blockedUserIds.has(otherUserId)) return null
        return {
          id: conversationId,
          pet: serializeChatPet(
            pet,
            contactOwnerFrom(contactOwners, pet.reportedBy),
            req.user,
            participantId,
            participantNameById.get(participantId) || 'Finder',
          ),
          lastMessage: serializedLastMessages.get(String(lastMessage._id)),
          updatedAt: lastMessage.createdAt,
          unreadCount: messagesByConversation.get(conversationId).filter((message) =>
            message.sender === (isOwner(pet, req.user._id) ? 'finder' : 'owner')
            && String(message.sentBy || '') !== String(req.user._id)
            && !(message.readBy || []).some((reader) => String(reader) === String(req.user._id)),
          ).length,
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

    res.json({ conversations })
  } catch (error) {
    next(error)
  }
}

// GET /api/chat/:petId
export async function getMessages(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    if (!mongoose.isValidObjectId(req.params.petId)) {
      return res.status(400).json({ error: 'Invalid pet id' })
    }

    const pet = await Pet.findOne(
      visibleContentFilter({ _id: req.params.petId }),
    ).select('reportedBy')
    if (!pet) return res.status(404).json({ error: 'Pet not found', code: 'CHAT_UNAVAILABLE' })

    const participantId = participantIdForRequest(req, pet, req.query)
    if (!participantId) {
      return res.status(400).json({ error: 'A valid conversation participant is required.', code: 'CHAT_PARTICIPANT_REQUIRED' })
    }

    const otherUserId = isOwner(pet, req.user._id) ? participantId : pet.reportedBy
    if (await usersBlockEachOther(req.user._id, otherUserId)) {
      return res.status(403).json({
        error: 'Messaging is unavailable for this conversation.',
        code: 'USER_BLOCKED',
      })
    }

    const messages = await findMessages({ pet: req.params.petId, participant: participantId })
    res.json({
      messages: await serializeMessages(messages),
      viewerRole: isOwner(pet, req.user._id) ? 'owner' : 'finder',
    })
  } catch (error) {
    next(error)
  }
}

// Acknowledge only messages displayed in this thread, never a client timestamp.
export async function markMessagesRead(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    const ids = req.body?.messageIds
    if (!mongoose.isValidObjectId(req.params.petId)
      || !Array.isArray(ids) || ids.length === 0 || ids.length > MAX_READ_MESSAGES
      || ids.some((id) => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))) {
      return res.status(400).json({ error: 'Invalid message read request.', code: 'CHAT_READ_INVALID', params: { max: MAX_READ_MESSAGES } })
    }
    const pet = await Pet.findOne(visibleContentFilter({ _id: req.params.petId })).select('reportedBy')
    if (!pet) return res.status(404).json({ error: 'Pet not found', code: 'CHAT_UNAVAILABLE' })
    const participantId = participantIdForRequest(req, pet, req.body)
    if (!participantId) {
      return res.status(400).json({ error: 'A valid conversation participant is required.', code: 'CHAT_PARTICIPANT_REQUIRED' })
    }
    const otherUserId = isOwner(pet, req.user._id) ? participantId : pet.reportedBy
    if (!otherUserId) return res.status(404).json({ error: 'Conversation not found', code: 'CHAT_UNAVAILABLE' })
    if (await usersBlockEachOther(req.user._id, otherUserId)) {
      return res.status(403).json({ error: 'Messaging is unavailable for this conversation.', code: 'USER_BLOCKED' })
    }
    await Message.updateMany({
      _id: { $in: [...new Set(ids)] },
      pet: req.params.petId,
      participant: participantId,
      sender: isOwner(pet, req.user._id) ? 'finder' : 'owner',
      sentBy: { $ne: req.user._id },
    }, { $addToSet: { readBy: req.user._id } })
    res.json({ success: true })
  } catch (error) {
    next(error)
  }
}

// POST /api/chat/:petId
export async function createMessage(req, res, next) {
  try {
    setLocationPrivacyHeaders(res)
    if (!mongoose.isValidObjectId(req.params.petId)) {
      return res.status(400).json({ error: 'Invalid pet id' })
    }
    if (!hasRequestBody(req)) return invalidRequestBody(res)
    rejectImageStrings(req.body)

    const { text, sharedStrayId, clientRequestId } = req.body
    const normalizedMessage = typeof text === 'string' ? text.trim() : ''
    const imageIds = validateImageIds(req.body.imageIds === undefined ? [] : req.body.imageIds, 'message')
    const normalizedRequestId = typeof clientRequestId === 'string' ? clientRequestId.trim() : ''
    if (normalizedRequestId.length > 100) return res.status(400).json({ error: 'Invalid clientRequestId.' })
    if (!normalizedMessage && !imageIds.length && !sharedStrayId) {
      return res.status(400).json({ error: 'A message requires text, a photo, or a shared post.', code: 'CHAT_MESSAGE_REQUIRED' })
    }
    if (normalizedMessage.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: 'Message is too long.', code: 'CHAT_MESSAGE_TOO_LONG', params: { max: MAX_MESSAGE_LENGTH } })
    }
    if (imageIds.length && !normalizedRequestId) throw imageError('IMAGE_REQUEST_INVALID')

    const pet = await Pet.findOne(
      visibleContentFilter({ _id: req.params.petId }),
    ).select('reportedBy')
    if (!pet) return res.status(404).json({ error: 'Pet not found', code: 'CHAT_UNAVAILABLE' })

    const participantId = participantIdForRequest(req, pet, req.body)
    if (!participantId) {
      return res.status(400).json({ error: 'A valid conversation participant is required.', code: 'CHAT_PARTICIPANT_REQUIRED' })
    }
    const otherUserId = isOwner(pet, req.user._id) ? participantId : pet.reportedBy
    if (await usersBlockEachOther(req.user._id, otherUserId)) {
      return res.status(403).json({
        error: 'Messaging is unavailable for this conversation.',
        code: 'USER_BLOCKED',
      })
    }
    if (isOwner(pet, req.user._id)) {
      const conversationExists = await Message.exists({
        pet: req.params.petId,
        participant: participantId,
      })
      const participantReportedSighting = conversationExists
        ? true
        : await Sighting.exists(visibleContentFilter({
            pet: req.params.petId,
            reportedBy: participantId,
          }))
      if (!conversationExists && !participantReportedSighting) {
        return res.status(404).json({ error: 'Conversation not found', code: 'CHAT_UNAVAILABLE' })
      }
    }

    let sharedStray = null
    if (sharedStrayId) {
      if (!mongoose.isValidObjectId(sharedStrayId)) return res.status(400).json({ error: 'Invalid shared stray post id.' })
      sharedStray = await Stray.findOne(visibleContentFilter({
        _id: sharedStrayId,
        active: { $ne: false },
      }))
      if (!sharedStray) return res.status(404).json({ error: 'Shared stray post is unavailable.' })
      if (!normalizedRequestId) return res.status(400).json({ error: 'clientRequestId is required when sharing a post.' })
    }

    const messageValues = {
      pet: req.params.petId,
      sender: isOwner(pet, req.user._id) ? 'owner' : 'finder',
      sentBy: req.user._id,
      participant: participantId,
      text: normalizedMessage,
      photo: '',
      sharedStray: sharedStray?._id || null,
      clientRequestId: normalizedRequestId || undefined,
    }
    const imageResult = imageIds.length
      ? (await commitContentImages({ Model: Message, type: 'message', purpose: 'message', userId: req.user._id,
          values: messageValues, imageIds, idempotencyFilter: { sentBy: req.user._id, clientRequestId: normalizedRequestId },
          validateReplay: (existing) => assertMessageReplay(existing, messageValues, imageIds),
          authorize: async (session) => {
            const target = await Pet.findOne(visibleContentFilter({ _id: pet._id })).session(session)
            if (!target || await usersBlockEachOther(req.user._id, otherUserId)) throw imageError('IMAGE_ATTACHMENT_FORBIDDEN')
          } }))
      : null
    const result = imageResult || (normalizedRequestId
      ? await upsertSubmission(Message, { sentBy: req.user._id, clientRequestId: normalizedRequestId }, messageValues,
        (existing) => assertMessageReplay(existing, messageValues, imageIds))
      : { doc: await Message.create(messageValues), duplicate: false })
    const message = result.doc

    const recipientId = isOwner(pet, req.user._id) ? participantId : pet.reportedBy
    if (recipientId && String(recipientId) !== String(req.user._id)) {
      await Notification.findOneAndUpdate(
        { user: recipientId, type: 'message', message: message._id },
        { $setOnInsert: { user: recipientId, pet: pet._id, stray: sharedStray?._id || null, message: message._id, type: 'message', title: 'New PawRadar message', body: normalizedMessage || (sharedStray ? 'Shared a stray animal post.' : 'Shared a photo.'), photo: sharedStray?.photo || message.photo || '' } },
        { upsert: true, new: true },
      )
    }
    res.status(result.duplicate ? 200 : 201).json({
      message: (await serializeMessages([message]))[0],
      duplicate: result.duplicate,
    })
  } catch (error) {
    next(error)
  }
}
