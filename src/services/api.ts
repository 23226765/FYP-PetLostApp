import axios from 'axios'
import type { Pet, Sighting } from '../types/pet'

// Direct backend base URL (CORS is enabled on the Express server).
// Override via VITE_API_BASE_URL for native/Capacitor or deployed builds.
const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
})

export interface NearbyParams {
  lng: number
  lat: number
  radiusKm?: number
  species?: 'Dog' | 'Cat' | 'Other'
  status?: 'lost' | 'sighted' | 'reunited'
}

export async function getNearbyPets(params: NearbyParams): Promise<Pet[]> {
  const { data } = await http.get<{ pets: Pet[] }>('/pets/nearby', { params })
  return data.pets
}

export async function getPet(id: string): Promise<Pet> {
  const { data } = await http.get<{ pet: Pet }>(`/pets/${id}`)
  return data.pet
}

export interface ReportPetPayload {
  name: string
  species: 'Dog' | 'Cat' | 'Other'
  breed?: string
  photo?: string
  description?: string
  details?: string
  reward?: string
  ownerName?: string
  ownerPhone?: string
  locationName?: string
  coordinates: [number, number]
  mapX?: number
  mapY?: number
}

export async function reportLostPet(payload: ReportPetPayload): Promise<Pet> {
  const { data } = await http.post<{ pet: Pet }>('/pets/report', payload)
  return data.pet
}

export interface SightingPayload {
  coordinates: [number, number]
  locationName?: string
  note?: string
  photo?: string
}

export async function reportSighting(
  petId: string,
  sightingData: SightingPayload,
): Promise<Sighting> {
  const { data } = await http.post<{ sighting: Sighting }>(
    `/pets/${petId}/sighting`,
    sightingData,
  )
  return data.sighting
}

export async function updatePetStatus(
  id: string,
  status: 'lost' | 'sighted' | 'reunited',
): Promise<Pet> {
  const { data } = await http.patch<{ pet: Pet }>(`/pets/${id}/status`, { status })
  return data.pet
}
