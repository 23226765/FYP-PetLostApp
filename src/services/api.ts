import axios from 'axios'
import type { Pet, Sighting } from '../types/pet'
import type { User } from '../types/user'

// Direct backend base URL (CORS is enabled on the Express server).
// Override via VITE_API_BASE_URL for native/Capacitor or deployed builds.
const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach the JWT to every request when a token is stored.
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto sign-out when a protected request returns 401 (expired/invalid token).
http.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error?.config?.url || ''
    const status = error?.response?.status
    if (status === 401 && !url.startsWith('/auth/')) {
      localStorage.removeItem('token')
      window.dispatchEvent(new Event('auth:unauthorized'))
    }
    return Promise.reject(error)
  },
)

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

/* ── Auth ── */

export interface AuthResponse {
  token: string
  user: User
}

export async function register(data: {
  name: string
  email: string
  password: string
  phone?: string
}): Promise<AuthResponse> {
  const { data: res } = await http.post<AuthResponse>('/auth/register', data)
  return res
}

export async function login(data: { email: string; password: string }): Promise<AuthResponse> {
  const { data: res } = await http.post<AuthResponse>('/auth/login', data)
  return res
}

export async function getProfile(): Promise<User> {
  const { data } = await http.get<{ user: User }>('/auth/me')
  return data.user
}
