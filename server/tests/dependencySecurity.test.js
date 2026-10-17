import test from 'node:test'
import assert from 'node:assert/strict'
import qs from 'qs'

test('patched qs safely round-trips a query containing a non-callable constructor.isBuffer', () => {
  const parsed = qs.parse('x%5Bconstructor%5D%5BisBuffer%5D=y', { plainObjects: true })
  assert.doesNotThrow(() => qs.stringify(parsed))
  assert.equal(qs.stringify(parsed), 'x%5Bconstructor%5D%5BisBuffer%5D=y')
})

test('patched qs enforces comma array limits for bracketed keys before allocating excess elements', () => {
  assert.throws(() => qs.parse('a[]=1,2,3,4', {
    comma: true, arrayLimit: 3, throwOnLimitExceeded: true,
  }), RangeError)
})
