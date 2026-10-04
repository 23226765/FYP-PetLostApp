import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MIN_ANONYMOUS_RADIUS_KM,
  PUBLIC_GRID_SIZE_METERS,
  anonymousSearchCoordinates,
  approximateCoordinates,
  canViewExactPetLocation,
  canViewExactSightingLocation,
  canViewExactStrayLocation,
  distanceBand,
  haversineDistanceKm,
  projectPetLocation,
  projectSightingLocation,
  projectStrayLocation,
  projectedDistanceKm,
} from '../services/locationPrivacy.js'

const owner = { _id: 'owner-id', role: 'user' }
const reporter = { _id: 'reporter-id', role: 'user' }
const unrelated = { _id: 'unrelated-id', role: 'user' }
const shelterAdmin = { _id: 'admin-id', role: 'shelter_admin' }
const exactCoordinates = [114.188123, 22.381456]
const pet = {
  reportedBy: owner._id,
  district: 'Sha Tin',
  locationName: 'Exact bench beside Sha Tin Park fountain',
  location: { type: 'Point', coordinates: exactCoordinates },
}
const sighting = {
  reportedBy: reporter._id,
  locationName: 'Exact fountain entrance',
  location: { type: 'Point', coordinates: [114.190123, 22.382456] },
}
const stray = {
  reportedBy: reporter._id,
  district: 'Sha Tin',
  locationName: 'Exact riverside bench',
  location: { type: 'Point', coordinates: [114.191123, 22.383456] },
}

test('public projection uses a deterministic 750 metre cell centre in lng/lat order', () => {
  assert.equal(PUBLIC_GRID_SIZE_METERS, 750)
  const first = approximateCoordinates(exactCoordinates)
  const second = approximateCoordinates(exactCoordinates)

  assert.deepEqual(first, second)
  assert.notDeepEqual(first, exactCoordinates)
  assert.ok(first[0] > 113 && first[0] < 115, 'first coordinate remains longitude')
  assert.ok(first[1] > 21 && first[1] < 23, 'second coordinate remains latitude')
  assert.ok(haversineDistanceKm(first, exactCoordinates) < 0.54)
})

test('anonymous search origins are projected while authenticated origins remain internal-exact', () => {
  assert.equal(MIN_ANONYMOUS_RADIUS_KM, 1)
  assert.deepEqual(anonymousSearchCoordinates(null, exactCoordinates), approximateCoordinates(exactCoordinates))
  assert.deepEqual(anonymousSearchCoordinates(owner, exactCoordinates), exactCoordinates)
})

test('pet and rescue exact locations are limited to their author, including against shelter admins', () => {
  for (const requester of [null, unrelated, shelterAdmin]) {
    assert.equal(canViewExactPetLocation(requester, pet), false)
    assert.equal(canViewExactStrayLocation(requester, stray), false)
    const petProjection = projectPetLocation(pet, requester)
    assert.equal(petProjection.locationPrecision, 'approximate')
    assert.equal(petProjection.location, 'Sha Tin')
    assert.notDeepEqual(petProjection.coordinates, pet.location.coordinates)
    const strayProjection = projectStrayLocation(stray, requester)
    assert.equal(strayProjection.locationPrecision, 'approximate')
    assert.equal(strayProjection.location, 'Sha Tin')
    assert.notDeepEqual(strayProjection.coordinates, stray.location.coordinates)
  }

  assert.equal(canViewExactPetLocation(owner, pet), true)
  assert.equal(projectPetLocation(pet, owner).location, pet.locationName)
  assert.deepEqual(projectPetLocation(pet, owner).coordinates, pet.location.coordinates)
  assert.equal(canViewExactStrayLocation(reporter, stray), true)
  assert.equal(projectStrayLocation(stray, reporter).location, stray.locationName)
  assert.deepEqual(projectStrayLocation(stray, reporter).coordinates, stray.location.coordinates)
})

test('sighting exact locations are limited to the pet owner and the sighting reporter', () => {
  for (const requester of [owner, reporter]) {
    assert.equal(canViewExactSightingLocation(requester, pet, sighting), true)
    assert.equal(projectSightingLocation(sighting, pet, requester).locationPrecision, 'exact')
    assert.deepEqual(projectSightingLocation(sighting, pet, requester).coordinates, sighting.location.coordinates)
  }

  for (const requester of [null, unrelated, shelterAdmin]) {
    assert.equal(canViewExactSightingLocation(requester, pet, sighting), false)
    const projection = projectSightingLocation(sighting, pet, requester)
    assert.equal(projection.locationPrecision, 'approximate')
    assert.equal(projection.location, 'Sha Tin')
    assert.notDeepEqual(projection.coordinates, sighting.location.coordinates)
  }
})

test('forced-public artifacts never inherit owner-authorized exact data', () => {
  const projectedPet = projectPetLocation(pet, owner, { forcePublic: true })
  const projectedSighting = projectSightingLocation(sighting, pet, owner, { forcePublic: true })
  const projectedStray = projectStrayLocation(stray, reporter, { forcePublic: true })

  for (const projection of [projectedPet, projectedSighting, projectedStray]) {
    assert.equal(projection.locationPrecision, 'approximate')
    assert.equal(projection.location, 'Sha Tin')
  }
})

test('public distances are rounded to half-kilometre values and Smart Match uses bands', () => {
  const projected = approximateCoordinates([114.197, 22.387])
  const distance = projectedDistanceKm(approximateCoordinates(exactCoordinates), projected)
  assert.ok(distance >= 0.5)
  assert.equal(distance * 2, Math.round(distance * 2))
  assert.equal(distanceBand(0.7), 'within_1_km')
  assert.equal(distanceBand(2.4), '1_to_3_km')
  assert.equal(distanceBand(4.5), '3_to_5_km')
  assert.equal(distanceBand(9), 'over_5_km')
})
