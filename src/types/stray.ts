export type StrayCondition = 'unknown' | 'healthy' | 'injured' | 'critical'
export type RescueStatus = 'reported' | 'rescue_dispatched' | 'rescued'

export interface StrayReport {
  id: string
  species: 'Dog' | 'Cat' | 'Other'
  description: string
  photo: string
  condition: StrayCondition
  district: string
  location: string
  coordinates: [number, number] | null
  rescueStatus: RescueStatus
  reporterName: string
  reporterPhone: string
  reportedBy?: string
  reportedAgo: string
  createdAt: string
  statusUpdatedAt: string
  distanceKm?: number
}
