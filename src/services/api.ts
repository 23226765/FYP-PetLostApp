import axios from 'axios'
import type { Pet, Sighting } from '../types/pet'
import type { AppNotification } from '../types/notification'
import type { User } from '../types/user'

// Use the same-origin Vite proxy by default. Deployments can provide an
// absolute VITE_API_BASE_URL when the API is hosted separately.
const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
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
    if (axios.isCancel(error)) return Promise.reject(error)

    const responseMessage = error?.response?.data?.error
    const message =
      typeof responseMessage === 'string'
        ? responseMessage
        : error?.response
          ? `Request failed with status ${error.response.status}.`
          : 'Cannot reach the PawRadar server. Check that the backend is running.'
    return Promise.reject(new Error(message))
  },
)

export interface NearbyParams {
  lng: number
  lat: number
  radiusKm?: number
  species?: 'Dog' | 'Cat' | 'Other'
  status?: 'lost' | 'sighted' | 'reunited'
}

export async function getNearbyPets(
  params: NearbyParams,
  signal?: AbortSignal,
): Promise<Pet[]> {
  const { data } = await http.get<{ pets: Pet[] }>('/pets/nearby', { params, signal })
  return data.pets
}

export async function getMyPets(): Promise<Pet[]> {
  const { data } = await http.get<{ pets: Pet[] }>('/pets/mine')
  return data.pets
}

export interface MySightingPet {
  _id: string
  name: string
  photo: string
  status: Pet['status']
  ownerPhone?: string
}

export interface MySighting {
  _id: string
  pet: MySightingPet | null
  locationName: string
  note: string
  photo?: string
  createdAt: string
}

export async function getMySightings(): Promise<MySighting[]> {
  const { data } = await http.get<{ sightings: MySighting[] }>('/pets/sightings/mine')
  return data.sightings
}

export async function getPet(id: string): Promise<Pet> {
  const { data } = await http.get<{ pet: Pet }>(`/pets/${id}`)
  return data.pet
}

export async function getPetSightings(petId: string): Promise<Sighting[]> {
  const { data } = await http.get<{ sightings: Sighting[] }>(`/pets/${petId}/sightings`)
  return data.sightings
}

export interface SightingConfirmation {
  confirmationCount: number
  confirmedByMe: boolean
}

export async function confirmSighting(
  petId: string,
  sightingId: string,
): Promise<SightingConfirmation> {
  const { data } = await http.post<SightingConfirmation>(
    `/pets/${petId}/sightings/${sightingId}/confirm`,
  )
  return data
}

export async function getNotifications(): Promise<AppNotification[]> {
  const { data } = await http.get<{ notifications: AppNotification[] }>('/notifications')
  return data.notifications
}

export interface ChatMessage {
  id: string
  petId: string
  sender: 'owner' | 'finder'
  text: string
  photo?: string
  createdAt: string
}

export interface SendMessagePayload {
  text: string
  photo?: string
  participantId?: string
}

export interface ChatPet {
  id: string
  name: string
  photo: string
  owner: string
  ownerPhone: string
  reportedBy?: string
  participantId?: string
  participantName?: string
}

export interface ChatConversation {
  id: string
  pet: ChatPet
  lastMessage: ChatMessage
  updatedAt: string
}

export interface ChatThread {
  messages: ChatMessage[]
  viewerRole: ChatMessage['sender']
}

export async function getChatInbox(): Promise<ChatConversation[]> {
  const { data } = await http.get<{ conversations: ChatConversation[] }>('/chat/inbox')
  return data.conversations
}

export async function getMessages(
  petId: string,
  participantId?: string,
): Promise<ChatThread> {
  const { data } = await http.get<ChatThread>(`/chat/${petId}`, {
    params: participantId ? { participantId } : undefined,
  })
  return data
}

export async function sendMessage(
  petId: string,
  payload: SendMessagePayload,
): Promise<ChatMessage> {
  const { data } = await http.post<{ message: ChatMessage }>(`/chat/${petId}`, payload)
  return data.message
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
