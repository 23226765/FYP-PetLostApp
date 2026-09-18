export const HK_DISTRICTS = [
  'Central and Western',
  'Eastern',
  'Southern',
  'Wan Chai',
  'Kowloon City',
  'Kwun Tong',
  'Sham Shui Po',
  'Wong Tai Sin',
  'Yau Tsim Mong',
  'Islands',
  'Kwai Tsing',
  'North',
  'Sai Kung',
  'Sha Tin',
  'Tai Po',
  'Tsuen Wan',
  'Tuen Mun',
  'Yuen Long',
] as const

export type HongKongDistrict = (typeof HK_DISTRICTS)[number]

export interface Pet {
  id: string
  name: string
  species: 'Dog' | 'Cat' | 'Other'
  breed: string
  district?: HongKongDistrict | string
  photo: string
  photos?: string[]
  description: string
  details?: string
  reward?: string
  owner: string
  ownerPhone?: string
  canViewContact: boolean
  reportedBy?: string
  status: 'lost' | 'sighted' | 'reunited'
  location: string
  distanceKm?: number
  lastSeen: string
  postedAgo: string
  mapX: number
  mapY: number
  coordinates?: [number, number] | null
}

export interface Sighting {
  id: string
  petId: string
  coordinates: [number, number]
  locationName?: string
  note?: string
  photo?: string
  sightedAt?: string
  createdAt?: string
  confirmationCount?: number
  confirmedByMe?: boolean
  reportedBy?: string
  reporterName?: string
  reporterPhone?: string
  canViewContact: boolean
}
