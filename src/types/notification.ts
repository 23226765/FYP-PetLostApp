export interface AppNotification {
  id: string
  type: 'proximity' | 'sighting' | 'message' | 'reunited'
  title: string
  body: string
  time: string
  photo?: string
  read: boolean
  petId?: string
  sightingId?: string
}
