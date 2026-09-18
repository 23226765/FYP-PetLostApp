import type { SightingPayload } from '../services/api'

export function isValidSightingCoordinates(
  coordinates: unknown,
): coordinates is [number, number] {
  return (
    Array.isArray(coordinates) &&
    coordinates.length === 2 &&
    typeof coordinates[0] === 'number' &&
    typeof coordinates[1] === 'number' &&
    Number.isFinite(coordinates[0]) &&
    Number.isFinite(coordinates[1]) &&
    coordinates[0] >= -180 &&
    coordinates[0] <= 180 &&
    coordinates[1] >= -90 &&
    coordinates[1] <= 90
  )
}

export function buildSightingPayload(input: {
  coordinates: unknown
  locationName: string
  note?: string
  photo?: string
  submissionId: string
}): SightingPayload {
  if (!isValidSightingCoordinates(input.coordinates)) {
    throw new Error('Select and confirm where the pet was sighted.')
  }
  const locationName = input.locationName.trim()
  if (!locationName) throw new Error('Add a location name or nearby landmark.')

  return {
    location: {
      type: 'Point',
      coordinates: [...input.coordinates],
    },
    locationName,
    note: input.note?.trim() || undefined,
    photo: input.photo || undefined,
    submissionId: input.submissionId,
  }
}
