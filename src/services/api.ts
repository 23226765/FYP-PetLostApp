import axios, { type AxiosRequestConfig } from 'axios'
import { captureAuthContext, isAuthContextCurrent, authContextError, setSessionToken, type AuthContext } from './authSession'
import type { Pet, Sighting } from '../types/pet'
import type { AppNotification } from '../types/notification'
import type { User } from '../types/user'
import type { UserPreferences } from '../types/user'
import type { RescueStatus, StrayComment, StrayCondition, StrayReport } from '../types/stray'
import type { HotspotResponse } from '../types/analytics'
import type {
  BlockedUser,
  ContentReportResult,
  ModerationReport,
  ModerationReportPage,
  ModerationReportStatus,
  ContentModerationStatus,
  ModeratedContentResult,
  ReportReason,
  ReportTargetType,
} from '../types/safety'

// Use the same-origin Vite proxy by default. Deployments can provide an
// absolute VITE_API_BASE_URL when the API is hosted separately.
const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
})

type AuthScopedConfig = {
  pawRadarAuthContext?: AuthContext
}

function authScopedRequestConfig(): AxiosRequestConfig & AuthScopedConfig {
  return { pawRadarAuthContext: captureAuthContext() }
}

function authContextChanged(config: unknown): boolean {
  const scoped = config as AuthScopedConfig | undefined
  return Boolean(scoped?.pawRadarAuthContext && !isAuthContextCurrent(scoped.pawRadarAuthContext))
}

// Attach the JWT to every request when a token is stored.
http.interceptors.request.use((config) => {
  const context = (config as typeof config & AuthScopedConfig).pawRadarAuthContext || captureAuthContext()
  if (!isAuthContextCurrent(context)) throw authContextError()
  const token = context.token
  ;(config as typeof config & AuthScopedConfig).pawRadarAuthContext = context
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto sign-out when a protected request returns 401 (expired/invalid token).
http.interceptors.response.use(
  (response) => {
    if (authContextChanged(response.config)) return Promise.reject(authContextError())
    return response
  },
  (error) => {
    if (error?.apiCode === 'AUTH_CONTEXT_CHANGED') return Promise.reject(error)
    if (authContextChanged(error?.config)) return Promise.reject(authContextError())
    const url = error?.config?.url || ''
    const status = error?.response?.status
    if (status === 401 && !['/auth/login', '/auth/register'].includes(url)) {
      setSessionToken(null)
      window.dispatchEvent(new Event('auth:unauthorized'))
    }
    if (axios.isCancel(error)) return Promise.reject(error)

    const responseMessage = error?.response?.data?.error ?? error?.response?.data?.message
    const message =
      typeof responseMessage === 'string'
        ? responseMessage
        : error?.response
          ? `Request failed with status ${error.response.status}.`
          : 'Cannot reach the PawRadar server. Check that the backend is running.'
    const clientError = new Error(message) as Error & { apiCode?: string; field?: string; params?: Record<string, unknown>; status?: number }
    clientError.apiCode = error?.response?.data?.code || (!error?.response ? 'NETWORK_UNAVAILABLE' : undefined)
    clientError.field = error?.response?.data?.field
    clientError.params = error?.response?.data?.params
    clientError.status = status
    return Promise.reject(clientError)
  },
)

export interface NearbyParams {
  lng: number
  lat: number
  radiusKm?: number
  species?: 'Dog' | 'Cat' | 'Other'
  status?: 'lost' | 'sighted' | 'reunited'
  breed?: string
  district?: string
}

export interface PageParams {
  page?: number
  limit?: number
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages?: number
  hasMore: boolean
}

export async function getNearbyPets(
  params: NearbyParams,
  signal?: AbortSignal,
): Promise<Pet[]> {
  const { data } = await http.get<{ pets: Pet[] }>('/pets/nearby', { params, signal })
  return data.pets
}

export interface HotspotParams {
  lng: number
  lat: number
  radiusKm?: number
  days?: number
  source?: 'all' | 'sightings' | 'strays'
}

export async function getHotspots(
  params: HotspotParams,
  signal?: AbortSignal,
): Promise<HotspotResponse> {
  const { data } = await http.get<HotspotResponse>('/analytics/hotspots', {
    params,
    signal,
  })
  return data
}

export interface SmartMatchCriteria {
  species: Pet['species']
  breed?: string
  /** GeoJSON coordinate order: [longitude, latitude]. */
  coordinates: [number, number]
  limit?: number
}

export interface SmartMatchBreakdown {
  species: number
  breed: number
  distance: number
  recency: number
  distanceBand: 'within_1_km' | '1_to_3_km' | '3_to_5_km' | 'over_5_km' | 'unknown'
  daysAgo: number | null
}

export type SmartMatchCandidate = Pet & {
  confidence: number
  totalScore: number
  breakdown: SmartMatchBreakdown
  sightingCount: number
}

export async function getSmartMatches(
  criteria: SmartMatchCriteria,
  signal?: AbortSignal,
): Promise<SmartMatchCandidate[]> {
  const { data } = await http.post<{ matches: SmartMatchCandidate[] }>(
    '/matches/candidates',
    criteria,
    { signal },
  )
  return data.matches
}

export async function getMyPetsPage(
  params: PageParams = {},
  signal?: AbortSignal,
): Promise<{
  pets: Pet[]
  pagination: Pagination
  summary: { total: number; reunited: number; active: number }
}> {
  const { data } = await http.get<{
    pets: Pet[]
    pagination: Omit<Pagination, 'hasMore'> & { hasMore?: boolean }
    summary: { total: number; reunited: number; active: number }
  }>('/pets/mine', { params, signal })
  return {
    pets: data.pets,
    summary: data.summary,
    pagination: {
      ...data.pagination,
      hasMore:
        data.pagination.hasMore ??
        data.pagination.page < (data.pagination.totalPages ?? data.pagination.page),
    },
  }
}

export async function getMyPets(): Promise<Pet[]> {
  return (await getMyPetsPage({ limit: 50 })).pets
}

export interface MySightingPet {
  _id: string
  name: string
  photo: string
  status: Pet['status']
  ownerPhone?: string
  canViewContact: boolean
}

export interface MySighting {
  _id: string
  pet: MySightingPet | null
  locationName: string
  locationPrecision: 'exact' | 'approximate'
  coordinates?: [number, number] | null
  note: string
  photo?: string
  sightedAt?: string
  createdAt: string
}

export async function getMySightings(): Promise<MySighting[]> {
  const { data } = await http.get<{ sightings: MySighting[] }>('/pets/sightings/mine')
  return data.sightings
}

export async function getPet(id: string, signal?: AbortSignal): Promise<Pet> {
  const { data } = await http.get<{ pet: Pet }>(`/pets/${id}`, { ...authScopedRequestConfig(), signal })
  return data.pet
}

export async function getPublicPet(id: string): Promise<Pet> {
  const { data } = await http.get<{ pet: Pet }>(`/pets/${id}`, {
    params: { view: 'public' },
  })
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

export interface NotificationPreferencesPayload {
  enabled: boolean
  radiusKm: number
  coordinates?: [number, number]
}

export async function updateNotificationPreferences(
  payload: NotificationPreferencesPayload,
): Promise<void> {
  await http.put('/notifications/preferences', payload)
}

export async function markNotificationRead(id: string): Promise<void> {
  await http.patch(`/notifications/${id}/read`)
}

export async function markAllNotificationsRead(): Promise<void> {
  await http.patch('/notifications/read-all')
}

export interface ChatMessage {
  id: string
  petId: string
  sender: 'owner' | 'finder'
  text: string
  photo?: string
  createdAt: string
  sharedStray?: Pick<StrayReport, 'id' | 'species' | 'animalType' | 'description' | 'photo' | 'district' | 'rescueStatus' | 'locationPrecision'> & { location: string }
  sharedStrayUnavailable?: boolean
}

export interface SendMessagePayload {
  text: string
  imageIds?: string[]
  participantId?: string
  sharedStrayId?: string
  clientRequestId?: string
}

export interface ChatPet {
  id: string
  name: string
  photo: string
  owner: string
  ownerPhone?: string
  canViewContact: boolean
  reportedBy?: string
  participantId?: string
  participantName?: string
}

export interface ChatConversation {
  id: string
  pet: ChatPet
  lastMessage: ChatMessage
  updatedAt: string
  unreadCount: number
}

export interface ChatThread {
  messages: ChatMessage[]
  viewerRole: ChatMessage['sender']
}

export async function getChatInbox(): Promise<ChatConversation[]> {
  const { data } = await http.get<{ conversations: ChatConversation[] }>('/chat/inbox', authScopedRequestConfig())
  return data.conversations
}

export async function getMessages(
  petId: string,
  participantId?: string,
): Promise<ChatThread> {
  const { data } = await http.get<ChatThread>(`/chat/${petId}`, {
    ...authScopedRequestConfig(),
    params: participantId ? { participantId } : undefined,
  })
  return data
}

export async function sendMessage(
  petId: string,
  payload: SendMessagePayload,
): Promise<ChatMessage> {
  const { data } = await http.post<{ message: ChatMessage }>(`/chat/${petId}`, payload, authScopedRequestConfig())
  return data.message
}

export async function markChatMessagesRead(petId: string, participantId: string | undefined, messageIds: string[]): Promise<void> {
  await http.patch(`/chat/${petId}/read`, { participantId, messageIds }, authScopedRequestConfig())
}

export interface ReportPetPayload {
  name: string
  species: 'Dog' | 'Cat' | 'Other'
  breed?: string
  district: string
  imageIds?: string[]
  submissionId?: string
  description?: string
  details?: string
  reward?: string
  ownerName?: string
  ownerPhone?: string
  locationName: string
  coordinates: [number, number]
  lastSeen?: string
  mapX?: number
  mapY?: number
}

export async function reportLostPet(payload: ReportPetPayload): Promise<Pet> {
  const { data } = await http.post<{ pet: Pet }>('/pets/report', payload)
  return data.pet
}

export interface SightingPayload {
  location: {
    type: 'Point'
    coordinates: [number, number]
  }
  locationName: string
  note?: string
  imageIds?: string[]
  submissionId: string
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

export interface NearbyStrayParams {
  lng: number
  lat: number
  radiusKm?: number
  species?: StrayReport['species']
  condition?: StrayCondition
  status?: RescueStatus
  district?: string
}

export async function getNearbyStrays(
  params: NearbyStrayParams,
  signal?: AbortSignal,
): Promise<StrayReport[]> {
  const { data } = await http.get<{ strays: StrayReport[] }>('/strays/nearby', {
    params,
    signal,
  })
  return data.strays
}

export async function getStrayById(id: string): Promise<StrayReport> {
  const { data } = await http.get<{ stray: StrayReport }>(`/strays/${id}`)
  return data.stray
}

export async function getMyStraysPage(
  params: PageParams = {},
  signal?: AbortSignal,
): Promise<{ strays: StrayReport[]; pagination: Pagination }> {
  const { data } = await http.get<{ strays: StrayReport[]; pagination: Pagination }>(
    '/strays/mine',
    { params, signal },
  )
  return data
}

export interface ReportStrayPayload {
  species: StrayReport['species']
  animalType?: string
  description: string
  imageIds: string[]
  condition: StrayCondition
  district: string
  locationName: string
  coordinates: [number, number]
  reporterName?: string
  reporterPhone?: string
  observedAt: string
  rescueStatus?: RescueStatus
  submissionId: string
}

export async function reportStray(payload: ReportStrayPayload): Promise<StrayReport> {
  const { data } = await http.post<{ stray: StrayReport }>('/strays/report', payload)
  return data.stray
}

export async function updateStrayStatus(
  id: string,
  status: RescueStatus,
): Promise<StrayReport> {
  const { data } = await http.patch<{ stray: StrayReport }>(`/strays/${id}/status`, {
    status,
  })
  return data.stray
}

export async function getStrayComments(id: string, page = 1): Promise<{ comments: StrayComment[]; pagination: Pagination }> {
  const { data } = await http.get<{ comments: StrayComment[]; pagination: Pagination }>(`/strays/${id}/comments`, { params: { limit: 50, page } })
  return data
}

export async function addStrayComment(id: string, text: string, submissionId: string): Promise<StrayComment> {
  const { data } = await http.post<{ comment: StrayComment }>(`/strays/${id}/comments`, { text, submissionId })
  return data.comment
}

export async function removeStrayComment(id: string, commentId: string): Promise<void> {
  await http.delete(`/strays/${id}/comments/${commentId}`)
}

export async function setStraySaved(id: string, saved: boolean): Promise<boolean> {
  const { data } = saved
    ? await http.put<{ saved: boolean }>(`/strays/${id}/saved`, undefined, authScopedRequestConfig())
    : await http.delete<{ saved: boolean }>(`/strays/${id}/saved`, authScopedRequestConfig())
  return data.saved
}

export async function getSavedStraysPage(
  params: PageParams = {},
  signal?: AbortSignal,
): Promise<{ strays: StrayReport[]; unavailableCount: number; pagination: Pagination }> {
  const { data } = await http.get<{
    strays: StrayReport[]
    unavailableCount: number
    pagination: Pagination
  }>('/strays/saved', { ...authScopedRequestConfig(), params, signal })
  return data
}

export async function getSavedStrays(): Promise<{ strays: StrayReport[]; unavailableCount: number }> {
  const { strays, unavailableCount } = await getSavedStraysPage({ limit: 50 })
  return { strays, unavailableCount }
}

export async function updateStray(id: string, payload: Pick<StrayReport, 'description' | 'species' | 'animalType' | 'condition'>): Promise<StrayReport> {
  const { data } = await http.patch<{ stray: StrayReport }>(`/strays/${id}`, payload)
  return data.stray
}

export async function deleteStray(id: string): Promise<void> {
  await http.delete(`/strays/${id}`)
}

export type ImagePurpose = 'avatar' | 'pet' | 'sighting' | 'stray' | 'message'
export interface ManagedImage { id: string; url: string; width: number; height: number; format: 'webp'; bytes: number }
export async function uploadManagedImage(file: Blob, purpose: ImagePurpose, idempotencyKey: string,
  options: { signal?: AbortSignal; onProgress?: (percent: number) => void } = {}): Promise<ManagedImage> {
  const form = new FormData()
  form.append('image', file, 'image')
  form.append('purpose', purpose)
  form.append('idempotencyKey', idempotencyKey)
  const { data } = await http.post<{ image: ManagedImage }>('/uploads/managed', form, {
    headers: { 'Content-Type': undefined }, signal: options.signal,
    onUploadProgress: (event) => options.onProgress?.(event.total ? Math.min(99, Math.round(event.loaded / event.total * 100)) : 0),
  })
  options.onProgress?.(100)
  return data.image
}
export async function discardManagedImage(id: string): Promise<void> { await http.delete(`/uploads/managed/${id}`) }
export async function replaceContentImages(type: 'user' | 'pet' | 'sighting' | 'stray' | 'message', id: string, imageIds: string[]): Promise<ManagedImage[]> {
  const { data } = await http.patch<{ images: ManagedImage[] }>(`/uploads/managed/content/${type}/${id}`, { imageIds })
  return data.images
}
export async function readManagedImage(path: string, signal: AbortSignal): Promise<Blob> {
  const { data } = await http.get<Blob>(path, { responseType: 'blob', signal })
  return data
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

export interface UpdateProfilePayload {
  name?: string
  displayName?: string
  realName?: string
  email?: string
  phone?: string
  avatarImageId?: string | null
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<User> {
  const { data } = await http.patch<{ success: boolean; user: User }>('/auth/me', payload)
  return data.user
}

export type ContactVisibility = 'private' | 'authenticated'

export interface ContactPrivacy {
  contactVisibility: ContactVisibility
}

export async function getContactPrivacy(): Promise<ContactPrivacy> {
  const { data } = await http.get<{ privacy: ContactPrivacy }>('/auth/me/privacy')
  return data.privacy
}

export async function updateContactPrivacy(
  contactVisibility: ContactVisibility,
): Promise<ContactPrivacy> {
  const { data } = await http.patch<{ success: boolean; privacy: ContactPrivacy }>(
    '/auth/me/privacy',
    { contactVisibility },
  )
  return data.privacy
}

export async function updateUserPreferences(
  preferences: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const { data } = await http.patch<{ success: boolean; preferences: UserPreferences }>(
    '/auth/me/preferences',
    preferences,
  )
  return data.preferences
}

export async function reportContent(payload: {
  targetType: ReportTargetType
  targetId: string
  reason: ReportReason
  details?: string
}): Promise<ContentReportResult> {
  const { data } = await http.post<{ report: ContentReportResult }>('/safety/reports', payload)
  return data.report
}

export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const { data } = await http.get<{ users: BlockedUser[] }>('/safety/blocks')
  return data.users
}

export async function blockUser(userId: string): Promise<BlockedUser> {
  const { data } = await http.put<{ blocked: true; user: BlockedUser }>(`/safety/blocks/${userId}`)
  return data.user
}

export async function unblockUser(userId: string): Promise<void> {
  await http.delete(`/safety/blocks/${userId}`)
}

export async function getModerationReports(params: {
  status?: ModerationReportStatus | 'all'
  targetType?: ReportTargetType
  page?: number
  limit?: number
} = {}): Promise<ModerationReportPage> {
  const { data } = await http.get<ModerationReportPage>('/moderation/reports', { params })
  return data
}

export async function updateModerationReport(
  id: string,
  payload: { status: ModerationReportStatus; note?: string },
): Promise<ModerationReport> {
  const { data } = await http.patch<{ report: ModerationReport }>(
    `/moderation/reports/${id}`,
    payload,
  )
  return data.report
}

export async function updateContentVisibility(
  targetType: 'pet' | 'sighting' | 'stray' | 'comment',
  targetId: string,
  payload: { moderationStatus: ContentModerationStatus; reason?: string },
): Promise<ModeratedContentResult> {
  const { data } = await http.patch<{ content: ModeratedContentResult }>(
    `/moderation/content/${targetType}/${targetId}/visibility`,
    payload,
  )
  return data.content
}
