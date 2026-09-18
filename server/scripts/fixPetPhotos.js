import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import Pet from '../models/Pet.js'
import {
  connectDatabase,
  databaseErrorMessage,
  disconnectDatabase,
} from '../config/database.js'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(scriptDirectory, '../.env') })

const fixes = [
  {
    name: 'Luna',
    species: 'Dog',
    breed: 'Border Collie',
    district: 'Central and Western',
    photo: 'https://images.unsplash.com/photo-1743556350903-265af4ffa3d9?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Ghost',
    species: 'Dog',
    breed: 'Samoyed',
    district: 'Islands',
    photo: 'https://images.unsplash.com/photo-1529429617124-95b109e86bb8?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Roxy',
    species: 'Dog',
    breed: 'Beagle',
    district: 'Kowloon City',
    photo: 'https://images.unsplash.com/photo-1505628346881-b72b27e84530?auto=format&fit=crop&w=800&q=80',
  },
]

async function run() {
  await connectDatabase()
  for (const pet of fixes) {
    const result = await Pet.updateMany(
      { name: pet.name },
      {
        $set: {
          species: pet.species,
          breed: pet.breed,
          district: pet.district,
          photo: pet.photo,
          photos: [pet.photo],
        },
      },
    )
    console.log(`${pet.name}: matched ${result.matchedCount}, updated ${result.modifiedCount}`)
  }
}

run()
  .then(() => console.log('Pet photo repair complete.'))
  .catch((error) => {
    console.error(`Pet photo repair failed: ${databaseErrorMessage(error)}`)
    process.exitCode = 1
  })
  .finally(() => disconnectDatabase())
