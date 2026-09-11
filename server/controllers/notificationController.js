import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'

function relativeTime(date) {
  const elapsed = Math.max(0, Date.now() - new Date(date).getTime())
  const minutes = Math.floor(elapsed / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function isCosmosOrderByIndexError(error) {
  return error?.code === 2 && String(error.message).includes('order-by item is excluded')
}

async function getRecentSightings() {
  try {
    return await Sighting.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('pet', 'name photo status')
  } catch (error) {
    if (!isCosmosOrderByIndexError(error)) throw error
    const sightings = await Sighting.find().populate('pet', 'name photo status')
    return sightings
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)
  }
}

async function getRecentLostPets() {
  try {
    return await Pet.find({ status: 'lost' }).sort({ createdAt: -1 }).limit(5)
  } catch (error) {
    if (!isCosmosOrderByIndexError(error)) throw error
    const pets = await Pet.find({ status: 'lost' })
    return pets
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
  }
}

// GET /api/notifications
export async function listNotifications(_req, res, next) {
  try {
    const [sightings, lostPets] = await Promise.all([
      getRecentSightings(),
      getRecentLostPets(),
    ])

    const sightingNotifications = sightings
      .filter((sighting) => sighting.pet)
      .map((sighting) => ({
        id: String(sighting._id),
        type: 'sighting',
        title: 'New sighting',
        body: `${sighting.pet.name} spotted near ${sighting.locationName || 'the reported location'}`,
        photo: sighting.photo || sighting.pet.photo,
        petId: String(sighting.pet._id),
        time: relativeTime(sighting.createdAt),
        timestamp: new Date(sighting.createdAt).getTime(),
        read: false,
      }))

    const proximityNotifications = lostPets.map((pet) => ({
      id: String(pet._id),
      type: 'proximity',
      title: 'New lost pet',
      body: `${pet.name} (${pet.breed || 'Unknown breed'})`,
      photo: pet.photo,
      petId: String(pet._id),
      time: relativeTime(pet.createdAt),
      timestamp: new Date(pet.createdAt).getTime(),
      read: false,
    }))

    const notifications = [...sightingNotifications, ...proximityNotifications]
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(({ timestamp: _timestamp, ...notification }) => notification)

    res.json({ notifications })
  } catch (error) {
    next(error)
  }
}
