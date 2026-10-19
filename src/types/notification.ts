export interface AppNotification {
  id: string
  type: 'proximity' | 'sighting' | 'message' | 'reunited' | 'comment'
  title: string
  body: string
  time: string
  photo?: string
  read: boolean
  petId?: string
  sightingId?: string
  strayId?: string
  createdAt?: string
  event?: { code: string; params: Record<string, string | number> }
  conversation?: { petId: string; participantId: string; messageId: string }
}
