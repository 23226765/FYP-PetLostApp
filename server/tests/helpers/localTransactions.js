import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'

// No dotenv or application URI. Only disposable, credential-free loopback sets.
export function validateLocalTransactionUri(uri) {
  let parsed
  try { parsed = new URL(uri) } catch { throw new Error('Invalid isolated transaction test configuration.') }
  assert.equal(parsed.protocol, 'mongodb:')
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname), 'Only a loopback test replica set is permitted')
  assert.ok(!parsed.username && !parsed.password, 'Application credentials are prohibited')
  assert.match(parsed.pathname, /^\/fyp_transactions_[a-f0-9]{32}$/)
  assert.match(parsed.searchParams.get('replicaSet') || '', /^fyp_transactions_[a-f0-9]{32}$/)
  assert.ok([...parsed.searchParams.keys()].every((key) => key === 'replicaSet'), 'Unexpected connection options are prohibited')
  assert.ok(parsed.port && !parsed.hash)
  return parsed
}

export async function openTransactionDatabase(uri, category, t) {
  const parsed = validateLocalTransactionUri(uri)
  assert.ok(['media', 'sighting', 'quota', 'rescue'].includes(category))
  const database = `fyp_transactions_${category}_${randomUUID().replaceAll('-', '')}`
  const connection = await mongoose.createConnection(uri, {
    dbName: database, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000,
  }).asPromise().catch(() => { throw new Error('Isolated local transaction database unavailable; details withheld.') })
  try {
    const hello = await connection.db.admin().command({ hello: 1 })
    assert.equal(hello.setName, parsed.searchParams.get('replicaSet'))
    assert.ok(hello.hosts.length === 1, 'Use the dedicated single-node test replica set')
    const host = new URL(`mongodb://${hello.hosts[0]}`)
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname))
    assert.equal(connection.name, database)
    t.diagnostic(`Real MongoDB database: ${database}; replica set: ${hello.setName}`)
    return { connection, database }
  } catch (error) { await connection.close(); throw error }
}
