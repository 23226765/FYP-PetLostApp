import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { initializeApplicationCollections } from '../config/collections.js'
import {
  connectDatabase,
  DATABASE_NAME,
  databaseErrorMessage,
  disconnectDatabase,
} from '../config/database.js'
import Message from '../models/Message.js'
import Notification from '../models/Notification.js'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import Stray from '../models/Stray.js'
import User from '../models/User.js'

export const SEED_BATCH = 'fyp-demo-v1'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(scriptDirectory, '../.env') })

const now = Date.now()
const hoursAgo = (hours) => new Date(now - hours * 60 * 60 * 1000)
const imageUrl = (label) => `https://placehold.co/800x600/png?text=${encodeURIComponent(label)}`

function seedId(type, key) {
  const hex = createHash('sha256')
    .update(`${SEED_BATCH}:${type}:${key}`)
    .digest('hex')
    .slice(0, 24)
  return new mongoose.Types.ObjectId(hex)
}

function seedConfiguration() {
  if (process.env.NODE_ENV === 'production') {
    const error = new Error('Test seeding is disabled when NODE_ENV=production.')
    error.code = 'TEST_SEED_DISABLED_IN_PRODUCTION'
    throw error
  }
  if (process.env.ALLOW_TEST_SEED !== 'true') {
    const error = new Error('Test seed refused. Set ALLOW_TEST_SEED=true in server/.env.')
    error.code = 'TEST_SEED_NOT_ALLOWED'
    throw error
  }

  const password = process.env.SEED_USER_PASSWORD
  if (typeof password !== 'string' || password.length < 6 || password.length > 128) {
    const error = new Error('SEED_USER_PASSWORD must contain between 6 and 128 characters.')
    error.code = 'TEST_SEED_PASSWORD_INVALID'
    throw error
  }
  return { password }
}

async function ensureDocument(Model, type, key, values) {
  const _id = seedId(type, key)
  const existing = await Model.findById(_id).select('+seedBatch')
  if (existing) {
    if (existing.seedBatch !== SEED_BATCH) {
      const error = new Error(`Deterministic ${type} identifier is already in use.`)
      error.code = 'TEST_SEED_ID_CONFLICT'
      throw error
    }
    return { document: existing, created: false }
  }

  try {
    const document = await Model.create({
      _id,
      ...values,
      seedBatch: SEED_BATCH,
    })
    return { document, created: true }
  } catch (error) {
    if (error?.code === 11000) {
      const conflict = new Error(`A non-seed ${type} record conflicts with the demo data.`)
      conflict.code = 'TEST_SEED_UNIQUE_CONFLICT'
      throw conflict
    }
    throw error
  }
}

async function seedUsers(password) {
  const passwordHash = await bcrypt.hash(password, 10)
  const definitions = [
    {
      key: 'owner',
      name: 'Maya Demo',
      realName: 'Maya Demo Person',
      email: 'fyp.owner@pawradar.test',
      phone: '+852 5000 0101',
      role: 'user',
      alertsEnabled: true,
      alertRadiusKm: 8,
      privacy: { contactVisibility: 'authenticated' },
      alertLocation: { type: 'Point', coordinates: [114.1588, 22.2819] },
    },
    {
      key: 'finder',
      name: 'Leo Demo',
      realName: 'Leo Demo Person',
      email: 'fyp.finder@pawradar.test',
      phone: '+852 5000 0102',
      role: 'user',
      alertsEnabled: true,
      alertRadiusKm: 5,
      privacy: { contactVisibility: 'private' },
      alertLocation: { type: 'Point', coordinates: [114.1694, 22.3193] },
    },
    {
      key: 'shelter',
      name: 'Harbour Paws Demo',
      realName: 'Harbour Paws Demo Operator',
      email: 'fyp.shelter@pawradar.test',
      phone: '+852 5000 0103',
      role: 'shelter_admin',
      alertsEnabled: true,
      alertRadiusKm: 15,
      privacy: { contactVisibility: 'private' },
      alertLocation: { type: 'Point', coordinates: [114.195, 22.381] },
    },
  ]

  const users = {}
  let created = 0
  for (const definition of definitions) {
    const { key, ...profile } = definition
    const result = await ensureDocument(User, 'user', key, {
      ...profile,
      avatar: imageUrl(profile.name),
      password: passwordHash,
      createdAt: hoursAgo(240),
      updatedAt: hoursAgo(240),
    })
    await User.updateOne(
      { _id: result.document._id, seedBatch: SEED_BATCH },
      { $set: { privacy: profile.privacy } },
    )
    result.document.privacy = profile.privacy
    users[key] = result.document
    if (result.created) created += 1
  }
  return { users, created }
}

async function seedPets(users) {
  const definitions = [
    {
      key: 'maple',
      name: 'Maple',
      species: 'Dog',
      breed: 'Shiba Inu',
      district: 'Central and Western',
      description: 'Fictional demo dog wearing a teal harness and a round name tag.',
      details: 'Tan coat, curled tail, teal harness.',
      reward: '$500',
      ownerName: users.owner.name,
      ownerPhone: users.owner.phone,
      status: 'lost',
      locationName: 'Hong Kong Park, Central',
      location: { type: 'Point', coordinates: [114.1602, 22.2775] },
      lastSeen: hoursAgo(10),
      mapX: 47,
      mapY: 58,
      reportedBy: users.owner._id,
    },
    {
      key: 'pixel',
      name: 'Pixel',
      species: 'Cat',
      breed: 'British Shorthair',
      district: 'Wan Chai',
      description: 'Fictional grey indoor cat used for the sighting workflow demonstration.',
      details: 'Grey coat, amber eyes, coral collar.',
      reward: '',
      ownerName: users.owner.name,
      ownerPhone: users.owner.phone,
      status: 'sighted',
      locationName: 'Victoria Park, Causeway Bay',
      location: { type: 'Point', coordinates: [114.188, 22.2823] },
      lastSeen: hoursAgo(5),
      mapX: 65,
      mapY: 55,
      reportedBy: users.owner._id,
    },
    {
      key: 'comet',
      name: 'Comet',
      species: 'Dog',
      breed: 'Border Collie',
      district: 'Southern',
      description: 'Fictional reunited pet retained to demonstrate the completed lifecycle.',
      details: 'Black and white coat, blue collar.',
      reward: '',
      ownerName: users.owner.name,
      ownerPhone: users.owner.phone,
      status: 'reunited',
      locationName: 'Aberdeen Promenade',
      location: { type: 'Point', coordinates: [114.1569, 22.2478] },
      lastSeen: hoursAgo(96),
      mapX: 44,
      mapY: 78,
      reportedBy: users.owner._id,
    },
    {
      key: 'taro',
      name: 'Taro',
      species: 'Dog',
      breed: 'Beagle',
      district: 'Sha Tin',
      description: 'Fictional tricolour beagle reported by the demo shelter account.',
      details: 'Tricolour coat, long ears, green lead.',
      reward: '$300',
      ownerName: users.shelter.name,
      ownerPhone: users.shelter.phone,
      status: 'lost',
      locationName: 'Sha Tin Park',
      location: { type: 'Point', coordinates: [114.1908, 22.3815] },
      lastSeen: hoursAgo(30),
      mapX: 59,
      mapY: 18,
      reportedBy: users.shelter._id,
    },
    {
      key: 'nimbus',
      name: 'Nimbus',
      species: 'Cat',
      breed: 'Domestic Shorthair',
      district: 'Yau Tsim Mong',
      description: 'Fictional black-and-white cat used for district and status filters.',
      details: 'Black-and-white coat, no collar.',
      reward: '',
      ownerName: users.finder.name,
      ownerPhone: users.finder.phone,
      status: 'sighted',
      locationName: 'Kowloon Park, Tsim Sha Tsui',
      location: { type: 'Point', coordinates: [114.1709, 22.3001] },
      lastSeen: hoursAgo(18),
      mapX: 50,
      mapY: 42,
      reportedBy: users.finder._id,
    },
  ]

  const pets = {}
  let created = 0
  for (const definition of definitions) {
    const { key, ...petData } = definition
    const photo = imageUrl(`${petData.name} ${petData.breed}`)
    const result = await ensureDocument(Pet, 'pet', key, {
      ...petData,
      photo,
      photos: [photo],
      createdAt: hoursAgo(48),
      updatedAt: hoursAgo(2),
    })
    pets[key] = result.document
    if (result.created) created += 1
  }
  return { pets, created }
}

async function seedStrays(users) {
  const definitions = [
    {
      key: 'wan-chai-cat',
      species: 'Cat',
      description: 'Fictional ginger stray limping near a sheltered walkway.',
      photo: imageUrl('Demo ginger stray cat'),
      condition: 'injured',
      district: 'Wan Chai',
      locationName: 'Southorn Playground, Wan Chai',
      location: { type: 'Point', coordinates: [114.1731, 22.2764] },
      rescueStatus: 'rescue_dispatched',
      reporterName: users.finder.name,
      reporterPhone: users.finder.phone,
      reportedBy: users.finder._id,
      statusUpdatedAt: hoursAgo(2),
      createdAt: hoursAgo(8),
      updatedAt: hoursAgo(2),
    },
    {
      key: 'sha-tin-dog',
      species: 'Dog',
      description: 'Fictional friendly mixed-breed dog transferred to demo shelter care.',
      photo: imageUrl('Demo rescued mixed breed dog'),
      condition: 'healthy',
      district: 'Sha Tin',
      locationName: 'Shing Mun River Promenade',
      location: { type: 'Point', coordinates: [114.1973, 22.3824] },
      rescueStatus: 'rescued',
      reporterName: users.shelter.name,
      reporterPhone: users.shelter.phone,
      reportedBy: users.shelter._id,
      statusUpdatedAt: hoursAgo(4),
      createdAt: hoursAgo(36),
      updatedAt: hoursAgo(4),
    },
  ]

  let created = 0
  for (const definition of definitions) {
    const { key, ...strayData } = definition
    const result = await ensureDocument(Stray, 'stray', key, strayData)
    if (result.created) created += 1
  }
  return { created }
}

async function seedSightings(users, pets) {
  const definitions = [
    {
      key: 'maple-central-1',
      pet: pets.maple._id,
      reportedBy: users.finder._id,
      location: { type: 'Point', coordinates: [114.1621, 22.2796] },
      locationName: 'Queensway near Pacific Place',
      note: 'Fictional sighting: dog matching Maple walking west with teal harness.',
      photo: imageUrl('Maple demo sighting one'),
      reporterName: users.finder.name,
      reporterPhone: users.finder.phone,
      confirmedBy: [users.owner._id],
      resolved: false,
      createdAt: hoursAgo(8),
      updatedAt: hoursAgo(8),
    },
    {
      key: 'maple-admiralty-2',
      pet: pets.maple._id,
      reportedBy: users.finder._id,
      location: { type: 'Point', coordinates: [114.1657, 22.2791] },
      locationName: 'Harcourt Garden, Admiralty',
      note: 'Fictional follow-up sighting showing the chronological movement trace.',
      photo: imageUrl('Maple demo sighting two'),
      reporterName: users.finder.name,
      reporterPhone: users.finder.phone,
      confirmedBy: [users.owner._id, users.shelter._id],
      resolved: false,
      createdAt: hoursAgo(6),
      updatedAt: hoursAgo(6),
    },
    {
      key: 'taro-sha-tin',
      pet: pets.taro._id,
      reportedBy: users.owner._id,
      location: { type: 'Point', coordinates: [114.1942, 22.3797] },
      locationName: 'New Town Plaza footbridge',
      note: 'Fictional beagle sighting reported for the shelter-owned case.',
      photo: imageUrl('Taro demo sighting'),
      reporterName: users.owner.name,
      reporterPhone: users.owner.phone,
      confirmedBy: [users.shelter._id],
      resolved: false,
      createdAt: hoursAgo(20),
      updatedAt: hoursAgo(20),
    },
    {
      key: 'pixel-victoria-park',
      pet: pets.pixel._id,
      reportedBy: users.shelter._id,
      location: { type: 'Point', coordinates: [114.1894, 22.2816] },
      locationName: 'Victoria Park central lawn',
      note: 'Fictional grey cat sighting near the park maintenance building.',
      photo: imageUrl('Pixel demo sighting'),
      reporterName: users.shelter.name,
      reporterPhone: users.shelter.phone,
      confirmedBy: [users.owner._id],
      resolved: false,
      createdAt: hoursAgo(4),
      updatedAt: hoursAgo(4),
    },
  ]

  const sightings = {}
  let created = 0
  for (const definition of definitions) {
    const { key, ...sightingData } = definition
    const result = await ensureDocument(Sighting, 'sighting', key, sightingData)
    sightings[key] = result.document
    if (result.created) created += 1
  }
  return { sightings, created }
}

async function seedMessages(users, pets) {
  const definitions = [
    {
      key: 'maple-1',
      pet: pets.maple._id,
      sender: 'finder',
      sentBy: users.finder._id,
      participant: users.finder._id,
      text: 'Hi Maya, I saw a dog matching Maple near Queensway.',
      createdAt: hoursAgo(7.5),
      updatedAt: hoursAgo(7.5),
    },
    {
      key: 'maple-2',
      pet: pets.maple._id,
      sender: 'owner',
      sentBy: users.owner._id,
      participant: users.finder._id,
      text: 'Thank you. Was the dog still wearing a teal harness?',
      createdAt: hoursAgo(7.25),
      updatedAt: hoursAgo(7.25),
    },
    {
      key: 'maple-3',
      pet: pets.maple._id,
      sender: 'finder',
      sentBy: users.finder._id,
      participant: users.finder._id,
      text: 'Yes, and the dog was moving toward Admiralty.',
      createdAt: hoursAgo(7),
      updatedAt: hoursAgo(7),
    },
    {
      key: 'maple-4',
      pet: pets.maple._id,
      sender: 'owner',
      sentBy: users.owner._id,
      participant: users.finder._id,
      text: 'That sounds like Maple. I am heading there now.',
      createdAt: hoursAgo(6.75),
      updatedAt: hoursAgo(6.75),
    },
  ]

  let created = 0
  for (const definition of definitions) {
    const { key, ...messageData } = definition
    const result = await ensureDocument(Message, 'message', key, messageData)
    if (result.created) created += 1
  }
  return { created }
}

async function seedNotifications(users, pets, sightings) {
  const definitions = [
    {
      key: 'maple-sighting',
      user: users.owner._id,
      pet: pets.maple._id,
      sighting: sightings['maple-admiralty-2']._id,
      type: 'sighting',
      title: 'New sighting of Maple',
      body: 'Maple was spotted near Harcourt Garden, Admiralty.',
      photo: imageUrl('Maple notification'),
      read: false,
      createdAt: hoursAgo(6),
      updatedAt: hoursAgo(6),
    },
    {
      key: 'maple-message',
      user: users.owner._id,
      pet: pets.maple._id,
      type: 'message',
      title: 'New message about Maple',
      body: 'Leo Demo sent an update about Maple’s direction of travel.',
      photo: imageUrl('Maple message notification'),
      read: false,
      createdAt: hoursAgo(5.75),
      updatedAt: hoursAgo(5.75),
    },
    {
      key: 'comet-reunited',
      user: users.finder._id,
      pet: pets.comet._id,
      type: 'reunited',
      title: 'Comet is safely home',
      body: 'This fictional case demonstrates the reunited notification lifecycle.',
      photo: imageUrl('Comet reunited notification'),
      read: true,
      createdAt: hoursAgo(72),
      updatedAt: hoursAgo(72),
    },
  ]

  let created = 0
  for (const definition of definitions) {
    const { key, ...notificationData } = definition
    const result = await ensureDocument(Notification, 'notification', key, notificationData)
    if (result.created) created += 1
  }
  return { created }
}

async function collectionCounts() {
  const models = [
    ['users', User],
    ['pets', Pet],
    ['strays', Stray],
    ['sightings', Sighting],
    ['messages', Message],
    ['notifications', Notification],
  ]
  const counts = []
  for (const [collection, Model] of models) {
    counts.push({
      collection,
      seeded: await Model.countDocuments({ seedBatch: SEED_BATCH }),
      total: await Model.countDocuments({}),
    })
  }
  return counts
}

async function run() {
  const { password } = seedConfiguration()
  const connection = await connectDatabase()
  if (connection.name !== DATABASE_NAME) {
    const error = new Error(`Test seed refused outside "${DATABASE_NAME}".`)
    error.code = 'TEST_SEED_DATABASE_MISMATCH'
    throw error
  }

  await initializeApplicationCollections(connection)

  const { users, created: usersCreated } = await seedUsers(password)
  const { pets, created: petsCreated } = await seedPets(users)
  const { created: straysCreated } = await seedStrays(users)
  const { sightings, created: sightingsCreated } = await seedSightings(users, pets)
  const { created: messagesCreated } = await seedMessages(users, pets)
  const { created: notificationsCreated } = await seedNotifications(users, pets, sightings)

  console.log(`Seed batch: ${SEED_BATCH}`)
  console.log(
    `Created this run: users=${usersCreated}, pets=${petsCreated}, strays=${straysCreated}, sightings=${sightingsCreated}, messages=${messagesCreated}, notifications=${notificationsCreated}`,
  )
  for (const count of await collectionCounts()) {
    console.log(`${count.collection}: seeded=${count.seeded}, total=${count.total}`)
  }
}

run()
  .catch((error) => {
    const message = String(error?.code || '').startsWith('TEST_SEED_')
      ? error.message
      : databaseErrorMessage(error)
    console.error(`Test seed failed: ${message}`)
    process.exitCode = 1
  })
  .finally(() => disconnectDatabase())
