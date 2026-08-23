export interface AppNotification {
  id: number
  type: 'proximity' | 'sighting' | 'message' | 'reunited'
  title: string
  body: string
  time: string
  photo?: string
  read: boolean
  petId?: number
}
