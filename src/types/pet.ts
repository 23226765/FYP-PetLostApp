export interface Pet {
  id: string
  name: string
  species: 'Dog' | 'Cat' | 'Other'
  breed: string
  photo: string
  description: string
  details?: string
  reward?: string
  owner: string
  ownerPhone: string
  status: 'lost' | 'sighted' | 'reunited'
  location: string
  distanceKm: number
  lastSeen: string
  postedAgo: string
  mapX: number
  mapY: number
  coordinates?: [number, number]
}

export interface Sighting {
  id?: string
  petId: string
  coordinates: [number, number]
  locationName?: string
  note?: string
  photo?: string
  createdAt?: string
}
