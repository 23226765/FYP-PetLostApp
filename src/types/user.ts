export interface User {
  id: string
  name: string
  realName?: string
  email: string
  phone?: string
  avatar?: string
  role?: 'user' | 'shelter_admin'
  alertsEnabled?: boolean
  alertRadiusKm?: number
}
