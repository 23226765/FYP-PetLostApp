import type { LocationPrecision } from './pet'

export type StrayCondition = 'unknown' | 'healthy' | 'injured' | 'critical'
export type RescueStatus = 'reported' | 'rescue_dispatched' | 'rescued'

export interface StrayReport {
  id: string
  species: 'Dog' | 'Cat' | 'Other'
  animalType: string
  description: string
  photo: string
  photos: string[]
  condition: StrayCondition
  district: string
  location: string
  coordinates: [number, number] | null
  locationPrecision: LocationPrecision
  rescueStatus: RescueStatus
  reporterName: string
  author: { id?: string; name: string; avatar: string }
  reporterPhone?: string
  canViewContact: boolean
  reportedBy?: string
  interactionBlocked?: boolean
  reportedAgo: string
  observedAt: string
  createdAt: string
  updatedAt: string
  statusUpdatedAt: string
  distanceKm?: number
  commentCount: number
  commentPreview?: string
  isSaved: boolean
  canManage: boolean
}

export interface StrayComment {
  id: string
  strayId: string
  text: string
  author: { id?: string; name: string; avatar: string }
  createdAt: string
  updatedAt: string
}
