import type { SightingPayload } from '../services/api'
import { i18n } from '../i18n'

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
  imageIds?: string[]
  submissionId: string
}): SightingPayload {
  if (!isValidSightingCoordinates(input.coordinates)) {
    throw new Error(i18n.global.t('validation.sightingLocation'))
  }
  const locationName = input.locationName.trim()
  if (!locationName) throw new Error(i18n.global.t('validation.locationName'))

  return {
    location: {
      type: 'Point',
      coordinates: [...input.coordinates],
    },
    locationName,
    note: input.note?.trim() || undefined,
    imageIds: input.imageIds || [],
    submissionId: input.submissionId,
  }
}
