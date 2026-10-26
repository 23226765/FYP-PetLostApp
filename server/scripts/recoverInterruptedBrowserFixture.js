// Exact recovery of the interrupted browser-verification run; never application data.
import assert from 'node:assert/strict'
import { MongoMemoryServer } from 'mongodb-memory-server-core'
import mongoose from 'mongoose'
import { realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'

const run = 'f7097ccef154436ca4ed48a4015f8c0e'
const database = `fyp_transactions_browser_${run}`
const target = path.join(tmpdir(), 'mongo-mem-iFOKjH')
const resolved = await realpath(target)
assert.equal(resolved.toLowerCase(), path.resolve(target).toLowerCase())
assert.equal(path.dirname(resolved).toLowerCase(), (await realpath(tmpdir())).toLowerCase())
for (const key of Object.keys(process.env)) if (/MONGO|CLOUDINARY|SECRET|PASSWORD|TOKEN|DOTENV|^NODE_OPTIONS$|^DEBUG$/i.test(key)) delete process.env[key]
const ledger = { run, database, recoveredPath: resolved, records: {}, cleanupComplete: false }
let server, connection
try {
  // The old mongod is stopped. Reopen its exact disposable files as standalone;
  // no replication reconfiguration or connection to a remote host is possible.
  server = await MongoMemoryServer.create({ binary: { version: '8.0.17' }, instance: { ip: '127.0.0.1', dbPath: resolved, storageEngine: 'wiredTiger' } })
  const uri = server.getUri(database)
  assert.equal(new URL(uri).hostname, '127.0.0.1')
  connection = await mongoose.createConnection(uri, { dbName: database, autoCreate: false, autoIndex: false }).asPromise()
  assert.equal(connection.name, database)
  const dbs = await connection.db.admin().listDatabases({ nameOnly: true })
  ledger.databaseNames = dbs.databases.map(item => item.name)
  assert.ok(dbs.databases.every(item => ['admin', 'config', 'local', database].includes(item.name)), 'Unexpected database: recovery refused')
  const users = await connection.db.collection('users').find({}, { projection: { _id: 1, email: 1 } }).toArray()
  assert.ok(users.length === 0 || users.length === 3, 'Unexpected fixture count: recovery refused')
  if (users.length) assert.deepEqual(users.map(item => item.email).sort(), ['owner@browser.example.test', 'reporter@browser.example.test', 'shelter@browser.example.test'].sort())
  for (const { name } of await connection.db.listCollections().toArray()) {
    const table = connection.db.collection(name)
    const rows = await table.find({}, { projection: { _id: 1 } }).toArray()
    if (name !== 'users') assert.equal(rows.length, 0, 'Unexpected records: recovery refused')
    ledger.records[name] = rows.map(item => String(item._id))
  }
  if (users.length) await connection.db.collection('users').deleteMany({ _id: { $in: users.map(item => item._id) } })
  for (const { name } of await connection.db.listCollections().toArray()) assert.equal(await connection.db.collection(name).countDocuments({}), 0)
  ledger.exactRecordsRemoved = users.length
  ledger.emptyCollectionsVerified = true
  await connection.close(); connection = null
  await server.stop({ doCleanup: false }); server = null
  // The absolute target was verified above and only this run's DB was present.
  await rm(resolved, { recursive: true })
  ledger.cleanupComplete = true
  console.log(`Interrupted run: ${users.length} exact synthetic users removed; all collections empty; owned process stopped and verified temporary directory removed.`)
} finally {
  await connection?.close()
  await server?.stop({ doCleanup: false })
  await writeFile(new URL(`../../verification/browser-integration-2026-10-23/${run}/recovery.json`, import.meta.url), JSON.stringify(ledger, null, 2))
}
