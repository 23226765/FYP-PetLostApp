import { describe, expect, it } from 'vitest'
import type { Sighting } from '../../types/pet'
import { normalizeSightingHistory } from '../sightings'

function sighting(id: string, createdAt: string): Sighting {
  return {
    id,
    petId: 'pet-id',
    coordinates: [114.18, 22.38],
    locationPrecision: 'exact',
    locationName: 'Test location',
    createdAt,
    canViewContact: false,
  }
}

describe('normalizeSightingHistory', () => {
  it('deduplicates only by MongoDB id and sorts by report timestamp', () => {
    const later = sighting('later-id', '2026-09-18T10:00:00.000Z')
    const earlier = sighting('earlier-id', '2026-09-18T08:00:00.000Z')
    expect(normalizeSightingHistory([later, earlier, { ...earlier }])).toEqual([
      earlier,
      later,
    ])
  })

  it('is stable when the same API payload is normalized repeatedly', () => {
    const entry = sighting('one-id', '2026-09-18T08:00:00.000Z')
    const firstFetch = normalizeSightingHistory([entry])
    const secondFetch = normalizeSightingHistory([...firstFetch, entry])
    expect(secondFetch.map((item) => item.id)).toEqual(['one-id'])
  })

  it('orders by actual sighting time and falls back to creation time', () => {
    const reportedEarlier = {
      ...sighting('reported-earlier', '2026-09-18T11:00:00.000Z'),
      sightedAt: '2026-09-18T07:00:00.000Z',
    }
    const createdEarlier = sighting('created-earlier', '2026-09-18T08:00:00.000Z')
    expect(normalizeSightingHistory([createdEarlier, reportedEarlier])).toEqual([
      reportedEarlier,
      createdEarlier,
    ])
  })
})
