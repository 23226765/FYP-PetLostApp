import mongoose from 'mongoose'
import Message from '../models/Message.js'

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

function isCosmosOrderByIndexError(error) {
  return error?.code === 2 && String(error.message).includes('order-by item is excluded')
}

// GET /api/chat/:petId
export async function getMessages(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.petId)) {
      return res.status(400).json({ error: 'Invalid pet id' })
    }

    let messages
    try {
      messages = await Message.find({ pet: req.params.petId }).sort({ createdAt: 1 })
    } catch (error) {
      if (!isCosmosOrderByIndexError(error)) throw error
      messages = await Message.find({ pet: req.params.petId })
      messages.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
    }

    res.json({ messages: messages.map(serializeMessage) })
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

    const { sender, text, photo } = req.body
    if (!['owner', 'finder'].includes(sender)) {
      return res.status(400).json({ error: '`sender` must be owner or finder.' })
    }
    if (!String(text || '').trim() && !photo) {
      return res.status(400).json({ error: 'A message requires text or a photo.' })
    }

    const message = await Message.create({
      pet: req.params.petId,
      sender,
      text: String(text || '').trim(),
      photo: photo || '',
    })

    res.status(201).json({ message: serializeMessage(message) })
  } catch (error) {
    next(error)
  }
}
