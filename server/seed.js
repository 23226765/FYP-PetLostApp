import 'dotenv/config'
import mongoose from 'mongoose'
import Pet from './models/Pet.js'
import Sighting from './models/Sighting.js'

const MONGODB_URI = process.env.MONGODB_URI

const U = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=600&q=80`

// 12 realistic pets across Hong Kong districts.
// `coordinates` is [lng, lat]; `mapX`/`mapY` are normalized 0-100 for the stylized map.
const seed = [
  {
    name: 'Buddy', species: 'Dog', breed: 'Golden Retriever',
    photo: U('photo-1552053831-71594a27632d'),
    description: 'Very friendly, responds to his name. Wearing a blue collar with a bone-shaped tag.',
    details: 'Golden coat, blue collar, silver bone-shaped tag.',
    reward: '$200', ownerName: 'Sarah M.', ownerPhone: '+852 5123 4567',
    status: 'lost', locationName: 'Causeway Bay, Victoria Park',
    coordinates: [114.1852, 22.2807], mapX: 62, mapY: 60, hoursAgo: 8,
  },
  {
    name: 'Misha', species: 'Cat', breed: 'Gray Tabby',
    photo: U('photo-1514888286974-6c03e2ca1dba'),
    description: 'Indoor cat, easily scared. Green eyes, no collar. Please do not chase.',
    details: 'Gray tabby, green eyes, no collar.',
    reward: '', ownerName: 'Daniel K.', ownerPhone: '+852 6123 8890',
    status: 'sighted', locationName: 'Mong Kok, near the bakery',
    coordinates: [114.1694, 22.3193], mapX: 50, mapY: 35, hoursAgo: 20,
  },
  {
    name: 'Luna', species: 'Dog', breed: 'Border Collie',
    photo: U('photo-1550184658-ff6132a71714'),
    description: 'Slipped out of her harness during a walk. Very fast, shy with strangers.',
    details: 'Black and white coat, one blue eye.',
    reward: '$150', ownerName: 'Priya R.', ownerPhone: '+852 5341 2210',
    status: 'lost', locationName: 'Central, Statue Square',
    coordinates: [114.1582, 22.2819], mapX: 55, mapY: 52, hoursAgo: 6,
  },
  {
    name: 'Coco', species: 'Dog', breed: 'Dachshund',
    photo: U('photo-1543466835-00a7907e9de1'),
    description: 'Small brown dachshund with a red collar. Microchipped. Loves squeaky toys.',
    details: 'Brown coat, red collar, microchipped.',
    reward: '', ownerName: 'Tom & Ellie', ownerPhone: '+852 9342 7712',
    status: 'lost', locationName: 'Sha Tin, near the river',
    coordinates: [114.1974, 22.3771], mapX: 58, mapY: 15, hoursAgo: 40,
  },
  {
    name: 'Mochi', species: 'Dog', breed: 'Shiba Inu',
    photo: U('photo-1587300003388-59208cc962cb'),
    description: 'Escaped from the groomers. Friendly but nervous around traffic.',
    details: 'Tan coat, curled tail, red harness.',
    reward: '$150', ownerName: 'Ken W.', ownerPhone: '+852 6432 0098',
    status: 'lost', locationName: 'Tsim Sha Tsui, K11 Musea',
    coordinates: [114.172, 22.299], mapX: 45, mapY: 55, hoursAgo: 12,
  },
  {
    name: 'Biscuit', species: 'Cat', breed: 'Tabby',
    photo: U('photo-1573865526739-10659fec78a5'),
    description: 'Found hiding under a parked car. Owner has been notified.',
    details: 'Orange tabby with white paws.',
    reward: '$50', ownerName: 'Amy L.', ownerPhone: '+852 6890 1234',
    status: 'sighted', locationName: 'Wan Chai, Johnston Road',
    coordinates: [114.1727, 22.2763], mapX: 60, mapY: 55, hoursAgo: 30,
  },
  {
    name: 'Pepper', species: 'Cat', breed: 'Domestic Shorthair',
    photo: U('photo-1518791841217-8f162f1e1131'),
    description: 'All-black indoor cat, very timid. Do not chase — call instead.',
    details: 'Black coat, yellow eyes, no collar.',
    reward: '', ownerName: 'Sam T.', ownerPhone: '+852 9211 4456',
    status: 'sighted', locationName: 'Yau Ma Tei, Temple Street',
    coordinates: [114.17, 22.304], mapX: 48, mapY: 40, hoursAgo: 26,
  },
  {
    name: 'Hazel', species: 'Dog', breed: 'Corgi',
    photo: U('photo-1612195583950-b8fd34c87093'),
    description: 'Short legs, big personality. Ran off chasing a pigeon in the park.',
    details: 'Tan and white coat, no tail visible.',
    reward: '$80', ownerName: 'Joan C.', ownerPhone: '+852 6411 7788',
    status: 'lost', locationName: 'Tai Po, Waterfront Park',
    coordinates: [114.1683, 22.4515], mapX: 55, mapY: 5, hoursAgo: 50,
  },
  {
    name: 'Kenji', species: 'Dog', breed: 'Akita Mix',
    photo: U('photo-1568572933382-74d440642117'),
    description: 'Large and gentle. Broke free from the leash at the dog park.',
    details: 'Thick cream coat, dark muzzle.',
    reward: '', ownerName: 'Marcus F.', ownerPhone: '+852 9123 6677',
    status: 'lost', locationName: 'Tseung Kwan O, Po Lam',
    coordinates: [114.2599, 22.3071], mapX: 80, mapY: 28, hoursAgo: 22,
  },
  {
    name: 'Oreo', species: 'Cat', breed: 'Ragdoll',
    photo: U('photo-1533738363-b7f9aef128ce'),
    description: 'Friendly ragdoll that slipped out the balcony door. Blue eyes.',
    details: 'White and gray ragdoll, blue eyes.',
    reward: '$120', ownerName: 'Lily H.', ownerPhone: '+852 6322 3344',
    status: 'sighted', locationName: 'Sai Kung town centre',
    coordinates: [114.2705, 22.3815], mapX: 85, mapY: 18, hoursAgo: 15,
  },
  {
    name: 'Louie', species: 'Dog', breed: 'French Bulldog',
    photo: U('photo-1518020382113-a7e8fc38eac9'),
    description: 'Snorts when excited. Last seen near the ferry pier with no leash.',
    details: 'Brindle coat, white chest.',
    reward: '$200', ownerName: 'Rina S.', ownerPhone: '+852 5444 8899',
    status: 'lost', locationName: 'Central, Star Ferry Pier',
    coordinates: [114.155, 22.2825], mapX: 52, mapY: 50, hoursAgo: 9,
  },
  {
    name: 'Nala', species: 'Cat', breed: 'British Shorthair',
    photo: U('photo-1543852786-1cf6624b9987'),
    description: 'Blue-gray shorthair, very food motivated. Approached by a can of tuna.',
    details: 'Blue-gray coat, round amber eyes.',
    reward: '', ownerName: 'Kevin M.', ownerPhone: '+852 9388 1122',
    status: 'sighted', locationName: 'Sha Tin, New Town Plaza',
    coordinates: [114.189, 22.383], mapX: 60, mapY: 12, hoursAgo: 18,
  },
]

async function run() {
  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set. Add it to server/.env first.')
    process.exit(1)
  }
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 })
  console.log('✅ Connected. Seeding pawradar…')

  // Ensure geospatial (2dsphere) indexes exist before inserting.
  await Promise.all([Pet.createIndexes(), Sighting.createIndexes()])

  await Promise.all([Pet.deleteMany({}), Sighting.deleteMany({})])

  const docs = seed.map(({ hoursAgo, coordinates, ...rest }) => ({
    ...rest,
    location: { type: 'Point', coordinates },
    lastSeen: new Date(Date.now() - (hoursAgo || 24) * 3600 * 1000),
  }))

  const created = await Pet.insertMany(docs)
  console.log(`✅ Inserted ${created.length} pets into pawradar.pets`)

  await mongoose.disconnect()
  console.log('✅ Done.')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})

