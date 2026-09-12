import mongoose from 'mongoose'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'

/* ───────────────────────── Helpers ───────────────────────── */

function isPoint(obj) {
  return (
    obj &&
    obj.type === 'Point' &&
    Array.isArray(obj.coordinates) &&
    obj.coordinates.length === 2
  )
}

function relativeDay(date) {
  const now = new Date()
  const then = new Date(date)
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const b = new Date(then.getFullYear(), then.getMonth(), then.getDate())
  const days = Math.round((a - b) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

function relativeTime(date) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

// Maps the DB document to the shape the Vue frontend already consumes.
function serializePet(pet, distanceMeters) {
  const distanceKm =
    typeof distanceMeters === 'number'
      ? Math.max(0.1, Math.round((distanceMeters / 1000) * 10) / 10)
      : undefined
  return {
    id: String(pet._id),
    name: pet.name,
    species: pet.species,
    breed: pet.breed,
    photo: pet.photo,
    description: pet.description,
    details: pet.details || '',
    reward: pet.reward || undefined,
    owner: pet.ownerName,
    ownerPhone: pet.ownerPhone,
    status: pet.status,
    location: pet.locationName,
    distanceKm,
    lastSeen: pet.lastSeen ? relativeDay(pet.lastSeen) : '',
    postedAgo: pet.createdAt ? relativeTime(pet.createdAt) : '',
    mapX: pet.mapX,
    mapY: pet.mapY,
    coordinates: isPoint(pet.location) ? pet.location.coordinates : null,
  }
}

/* ───────────────────────── Routes ───────────────────────── */

// GET /api/pets
export async function listPets(req, res, next) {
  try {
    const { species, status } = req.query
    const filter = {}
    if (species) filter.species = species
    if (status) filter.status = status
    let docs
    try {
      docs = await Pet.find(filter).sort({ createdAt: -1 })
    } catch (error) {
      const isCosmosOrderByIndexError =
        error?.code === 2 && String(error.message).includes('order-by item is excluded')
      if (!isCosmosOrderByIndexError) throw error
      docs = await Pet.find(filter)
      docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }
    res.json({ pets: docs.map((p) => serializePet(p)) })
  } catch (err) {
    next(err)
  }
}

// GET /api/pets/mine
export async function listMyPets(req, res, next) {
  try {
    let docs
    try {
      docs = await Pet.find({ reportedBy: req.user._id }).sort({ createdAt: -1 })
    } catch (error) {
      const isCosmosOrderByIndexError =
        error?.code === 2 && String(error.message).includes('order-by item is excluded')
      if (!isCosmosOrderByIndexError) throw error
      docs = await Pet.find({ reportedBy: req.user._id })
      docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }
    res.json({ pets: docs.map((pet) => serializePet(pet)) })
  } catch (err) {
    next(err)
  }
}

// GET /api/pets/sightings/mine
export async function listMySightings(req, res, next) {
  try {
    let sightings
    try {
      sightings = await Sighting.find({ reportedBy: req.user._id })
        .sort({ createdAt: -1 })
        .populate('pet', 'name photo status')
    } catch (error) {
      const isCosmosOrderByIndexError =
        error?.code === 2 && String(error.message).includes('order-by item is excluded')
      if (!isCosmosOrderByIndexError) throw error
      sightings = await Sighting.find({ reportedBy: req.user._id }).populate('pet', 'name photo status')
      sightings.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
    }
    res.json({ sightings })
  } catch (err) {
    next(err)
  }
}

// GET /api/pets/nearby?lat=&lng=&radiusKm=&species=&status=
export async function getNearbyPets(req, res, next) {
  try {
    const { lat, lng, radiusKm, species, status } = req.query
    const latitude = Number(lat)
    const longitude = Number(lng)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ error: 'Query params `lat` and `lng` are required.' })
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Invalid coordinates.' })
    }
    const radiusMeters = (Number(radiusKm) > 0 ? Number(radiusKm) : 3) * 1000

    const pipeline = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [longitude, latitude] },
          distanceField: 'distanceMeters',
          maxDistance: radiusMeters,
          spherical: true,
          key: 'location',
        },
      },
    ]
    if (species) pipeline.push({ $match: { species } })
    if (status) pipeline.push({ $match: { status } })
    pipeline.push({ $sort: { distanceMeters: 1 } })

    const docs = await Pet.aggregate(pipeline)
    res.json({ pets: docs.map((p) => serializePet(p, p.distanceMeters)) })
  } catch (err) {
    next(err)
  }
}

// GET /api/pets/:id
export async function getPet(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid pet id' })
    }
    const pet = await Pet.findById(req.params.id)
    if (!pet) return res.status(404).json({ error: 'Pet not found' })
    res.json({ pet: serializePet(pet) })
  } catch (err) {
    next(err)
  }
}

// GET /api/pets/:id/sightings
export async function listSightings(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid pet id' })
    }

    let docs
    try {
      docs = await Sighting.find({ pet: req.params.id }).sort({ createdAt: -1 })
    } catch (error) {
      const isCosmosOrderByIndexError =
        error?.code === 2 && String(error.message).includes('order-by item is excluded')
      if (!isCosmosOrderByIndexError) throw error

      docs = await Sighting.find({ pet: req.params.id })
      docs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }
    const sightings = docs.map((sighting) => ({
      id: String(sighting._id),
      locationName: sighting.locationName,
      note: sighting.note,
      photo: sighting.photo,
      createdAt: sighting.createdAt,
    }))

    res.json({ sightings })
  } catch (err) {
    next(err)
  }
}

// POST /api/pets/report
export async function reportPet(req, res, next) {
  try {
    const {
      name, species, breed, photo, description, details, reward,
      ownerName, ownerPhone, locationName, coordinates, lastSeen, mapX, mapY,
    } = req.body

    if (!name || !species) {
      return res.status(400).json({ error: '`name` and `species` are required.' })
    }
    if (!isPoint({ type: 'Point', coordinates })) {
      return res.status(400).json({ error: '`coordinates` must be [lng, lat].' })
    }

    // Prefer the authenticated user's identity as the owner.
    const resolvedOwnerName = req.user?.name || ownerName || 'Anonymous'
    const resolvedOwnerPhone = req.user?.phone || ownerPhone || ''

    const pet = await Pet.create({
      name,
      species,
      breed: breed || '',
      photo: photo || '',
      description: description || '',
      details: details || '',
      reward: reward || '',
      ownerName: resolvedOwnerName,
      ownerPhone: resolvedOwnerPhone,
      locationName: locationName || '',
      location: { type: 'Point', coordinates },
      lastSeen: lastSeen ? new Date(lastSeen) : new Date(),
      mapX: Number.isFinite(Number(mapX)) ? Number(mapX) : 50,
      mapY: Number.isFinite(Number(mapY)) ? Number(mapY) : 50,
      status: 'lost',
      reportedBy: req.user?._id || undefined,
    })

    res.status(201).json({ pet: serializePet(pet) })
  } catch (err) {
    next(err)
  }
}

// POST /api/pets/:id/sighting
export async function submitSighting(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid pet id' })
    }
    const pet = await Pet.findById(req.params.id)
    if (!pet) return res.status(404).json({ error: 'Pet not found' })

    const { coordinates, locationName, note, photo, reporterName, reporterPhone } = req.body
    if (!isPoint({ type: 'Point', coordinates })) {
      return res.status(400).json({ error: '`coordinates` must be [lng, lat].' })
    }

    const sighting = await Sighting.create({
      pet: pet._id,
      reportedBy: req.user?._id || undefined,
      location: { type: 'Point', coordinates },
      locationName: locationName || '',
      note: note || '',
      photo: photo || '',
      reporterName: reporterName || '',
      reporterPhone: reporterPhone || '',
    })

    pet.status = 'sighted'
    await pet.save()

    res.status(201).json({
      sighting: {
        id: String(sighting._id),
        petId: String(pet._id),
        coordinates: sighting.location.coordinates,
        locationName: sighting.locationName,
        note: sighting.note,
        createdAt: sighting.createdAt,
      },
      pet: serializePet(pet),
    })
  } catch (err) {
    next(err)
  }
}

// PATCH /api/pets/:id/status
export async function updateStatus(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid pet id' })
    }
    const { status } = req.body
    if (!['lost', 'sighted', 'reunited'].includes(status)) {
      return res.status(400).json({ error: '`status` must be lost | sighted | reunited.' })
    }
    const pet = await Pet.findByIdAndUpdate(req.params.id, { status }, { new: true })
    if (!pet) return res.status(404).json({ error: 'Pet not found' })
    res.json({ pet: serializePet(pet) })
  } catch (err) {
    next(err)
  }
}
