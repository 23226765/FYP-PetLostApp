import test from 'node:test'
import assert from 'node:assert/strict'
import { validateLocalTransactionUri } from './helpers/localTransactions.js'

const name = `fyp_transactions_${'a'.repeat(32)}`
const valid = `mongodb://127.0.0.1:27099/${name}?replicaSet=${name}`
test('real transaction harness permits only isolated loopback database and replica-set names', () => {
  assert.equal(validateLocalTransactionUri(valid).hostname, '127.0.0.1')
  for (const uri of [
    valid.replace('127.0.0.1', 'example.test'), valid.replace('mongodb:', 'mongodb+srv:'),
    valid.replace(`/${name}?`, '/petlostapp?'), valid.replace(`/${name}?`, '/sample_mflix?'),
    valid.replace('127.0.0.1', 'user:password@127.0.0.1'), `${valid}&authSource=admin`,
    valid.replace(`replicaSet=${name}`, 'replicaSet=production'),
  ]) assert.throws(() => validateLocalTransactionUri(uri))
})
