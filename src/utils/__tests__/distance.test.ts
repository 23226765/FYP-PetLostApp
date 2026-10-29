import { expect, it } from 'vitest'
import { isValidDistance } from '../distance'

it.each([undefined, null, NaN, Infinity, -Infinity, -1, '', '0', '2', {}])('rejects unavailable/invalid distance %s without coercion', value => {
  expect(isValidDistance(value)).toBe(false)
})
it.each([0, 0.1, 2])('preserves a valid distance of %s km', value => {
  expect(isValidDistance(value)).toBe(true)
})
