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
  privacy?: {
    contactVisibility: 'private' | 'authenticated'
  }
  preferences?: UserPreferences
}

export type AppLanguage = 'en' | 'zh-HK' | 'zh-CN'
export type AppTheme = 'light' | 'dark'

export interface UserPreferences {
  language: AppLanguage
  theme: AppTheme
}
