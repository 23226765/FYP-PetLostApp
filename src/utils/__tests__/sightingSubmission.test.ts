import { describe, expect, it } from 'vitest'
import { buildSightingPayload, isValidSightingCoordinates } from '../sightingSubmission'

describe('sighting submission payload', () => {
  it('blocks submission until a valid point is selected', () => {
    expect(isValidSightingCoordinates(null)).toBe(false)
    expect(() =>
      buildSightingPayload({
        coordinates: null,
        locationName: 'Mong Kok',
        submissionId: 'sighting_test_001',
      }),
    ).toThrow('Select and confirm')
  })

  it('sends the confirmed point in GeoJSON longitude/latitude order', () => {
    expect(
      buildSightingPayload({
        coordinates: [114.1694, 22.3193],
        locationName: ' Mong Kok MTR Exit E2 ',
        note: ' Seen walking north ',
        submissionId: 'sighting_test_002',
      }),
    ).toEqual({
      location: { type: 'Point', coordinates: [114.1694, 22.3193] },
      locationName: 'Mong Kok MTR Exit E2',
      note: 'Seen walking north',
      photo: undefined,
      submissionId: 'sighting_test_002',
    })
  })
})
