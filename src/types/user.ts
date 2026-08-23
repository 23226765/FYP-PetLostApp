export interface User {
  id: string
  name: string
  email: string
  phone?: string
  avatar?: string
  role?: 'user' | 'shelter_admin'
}
