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
export type LocationPrecision = 'exact' | 'approximate'

export interface MapBounds { west: number; south: number; east: number; north: number }
export interface MapViewChange { lat: number; lng: number; zoom: number; bounds: MapBounds; initial?: boolean }

export interface AreaInsights {
  total: number
  speciesCounts: { dog: number; cat: number; other: number }
  unclassifiedSpeciesCount: number
  topDistricts: string[]
  topDistrictCount: number
  unknownDistrictCount: number
  unknownIsTop: boolean
  recentCount: number
  unknownDateCount: number
  futureDateCount: number
  windowStart: string
  windowEnd: string
}

export interface MapPetMarker {
  id: string
  name: string
  species: 'Dog' | 'Cat' | 'Other'
  breed: string
  status: 'lost' | 'sighted'
  district: string
  photo: string
  coordinates: [number, number]
  locationPrecision: 'approximate'
  locationSource: 'stored_report'
}
export interface MapPetPage {
  markers: MapPetMarker[]
  pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean }
  gridSizeMeters: number
  radiusKm?: number
  bounds?: MapBounds
  insights?: AreaInsights | null
}

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
  interactionBlocked?: boolean
  status: 'lost' | 'sighted' | 'reunited'
  location: string
  locationPrecision: LocationPrecision
  distanceKm?: number
  lastSeen: string
  postedAgo: string
  lastSeenAt?: string | null
  createdAt?: string | null
  mapX: number
  mapY: number
  coordinates?: [number, number] | null
}

export interface Sighting {
  id: string
  petId: string
  coordinates: [number, number]
  locationName?: string
  locationPrecision: LocationPrecision
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
