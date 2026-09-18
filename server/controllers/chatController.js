import mongoose from 'mongoose'
import Message from '../models/Message.js'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import User from '../models/User.js'
import {
  contactOwnerFrom,
  loadContactOwners,
  serializeContact,
} from '../services/contactPrivacy.js'

const MAX_MESSAGE_LENGTH = 2000
const MAX_PHOTO_LENGTH = 1_500_000

function serializeMessage(message) {
  return {
    id: String(message._id),
    petId: String(message.pet),
    sender: message.sender,
    text: message.text,
    photo: message.photo || undefined,
    createdAt: message.createdAt,
  }
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
    const ownedPets = await Pet.find({ reportedBy: req.user._id }).select(
      'name photo ownerName reportedBy',
    )
    const ownedPetIds = ownedPets.map((pet) => pet._id)
    const filters = [{ participant: req.user._id }]
    if (ownedPetIds.length) filters.push({ pet: { $in: ownedPetIds } })

    const messages = await findMessages({
      $and: [{ $or: filters }, { participant: { $ne: null } }],
    })
    const lastMessageByConversation = new Map()
    for (const message of messages) {
      const key = `${message.pet}:${message.participant}`
      lastMessageByConversation.set(key, message)
    }

    const conversationKeys = [...lastMessageByConversation.keys()]
    if (!conversationKeys.length) return res.json({ conversations: [] })

    const petIds = [...new Set(messages.map((message) => String(message.pet)))]
    const participantIds = [
      ...new Set(messages.map((message) => String(message.participant)).filter(Boolean)),
    ]

    const pets = await Pet.find({ _id: { $in: petIds } }).select(
      'name photo ownerName reportedBy',
    )
    const petById = new Map(pets.map((pet) => [String(pet._id), pet]))
    const contactOwners = await loadContactOwners(pets)
    const participants = await User.find({ _id: { $in: participantIds } }).select('name')
    const participantNameById = new Map(
      participants.map((participant) => [String(participant._id), participant.name]),
    )
    const conversations = conversationKeys
      .map((conversationId) => {
        const lastMessage = lastMessageByConversation.get(conversationId)
        if (!lastMessage) return null
        const petId = String(lastMessage.pet)
        const participantId = String(lastMessage.participant)
        const pet = petById.get(petId)
        if (!pet) return null
        return {
          id: conversationId,
          pet: serializeChatPet(
            pet,
            contactOwnerFrom(contactOwners, pet.reportedBy),
            req.user,
            participantId,
            participantNameById.get(participantId) || 'Finder',
          ),
          lastMessage: serializeMessage(lastMessage),
          updatedAt: lastMessage.createdAt,
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
    if (!mongoose.isValidObjectId(req.params.petId)) {
      return res.status(400).json({ error: 'Invalid pet id' })
    }

    const pet = await Pet.findById(req.params.petId).select('reportedBy')
    if (!pet) return res.status(404).json({ error: 'Pet not found' })

    const participantId = participantIdForRequest(req, pet, req.query)
    if (!participantId) {
      return res.status(400).json({ error: 'A valid conversation participant is required.' })
    }

    const messages = await findMessages({ pet: req.params.petId, participant: participantId })
    res.json({
      messages: messages.map(serializeMessage),
      viewerRole: isOwner(pet, req.user._id) ? 'owner' : 'finder',
    })
  } catch (error) {
    next(error)
  }
}

// POST /api/chat/:petId
export async function createMessage(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.petId)) {
      return res.status(400).json({ error: 'Invalid pet id' })
    }
    if (!hasRequestBody(req)) return invalidRequestBody(res)

    const { text, photo } = req.body
    const normalizedMessage = typeof text === 'string' ? text.trim() : ''
    const normalizedPhoto = typeof photo === 'string' ? photo.trim() : ''
    if (!normalizedMessage && !normalizedPhoto) {
      return res.status(400).json({ error: 'A message requires text or a photo.' })
    }
    if (normalizedMessage.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: 'Message is too long.' })
    }
    if (normalizedPhoto.length > MAX_PHOTO_LENGTH) {
      return res.status(413).json({ error: 'Photo is too large. Choose a smaller image.' })
    }

    const pet = await Pet.findById(req.params.petId).select('reportedBy')
    if (!pet) return res.status(404).json({ error: 'Pet not found' })

    const participantId = participantIdForRequest(req, pet, req.body)
    if (!participantId) {
      return res.status(400).json({ error: 'A valid conversation participant is required.' })
    }
    if (isOwner(pet, req.user._id)) {
      const conversationExists = await Message.exists({
        pet: req.params.petId,
        participant: participantId,
      })
      const participantReportedSighting = conversationExists
        ? true
        : await Sighting.exists({ pet: req.params.petId, reportedBy: participantId })
      if (!conversationExists && !participantReportedSighting) {
        return res.status(404).json({ error: 'Conversation not found' })
      }
    }

    const message = await Message.create({
      pet: req.params.petId,
      sender: isOwner(pet, req.user._id) ? 'owner' : 'finder',
      sentBy: req.user._id,
      participant: participantId,
      text: normalizedMessage,
      photo: normalizedPhoto,
    })

    res.status(201).json({ message: serializeMessage(message) })
  } catch (error) {
    next(error)
  }
}
