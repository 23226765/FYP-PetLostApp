// One exact interrupted local test run. Not a seed, migration or live cleanup.
import assert from 'node:assert/strict'
import { readFile, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import mongoose from 'mongoose'
import { MongoMemoryReplSet } from 'mongodb-memory-server-core'

const run = '0eb769b6fbbc4443aa906aef5ce27f41'
const database = `fyp_transactions_browser_${run}`
const folder = new URL(`../../verification/browser-integration-2026-10-26/${run}/`, import.meta.url)
const evidence = JSON.parse(await readFile(new URL('ledger.json', folder), 'utf8'))
assert.equal(evidence.database, database)
const target = await realpath(path.join(tmpdir(), 'mongo-mem-ZjJ9i0'))
assert.equal(path.dirname(target).toLowerCase(), (await realpath(tmpdir())).toLowerCase())
assert.equal(path.basename(target), 'mongo-mem-ZjJ9i0')
for (const key of Object.keys(process.env)) if (/MONGO|CLOUDINARY|SECRET|PASSWORD|TOKEN|DOTENV|^NODE_OPTIONS$|^DEBUG$/i.test(key)) delete process.env[key]
const last = evidence.snapshots.at(-1)
const allowed = {
  users: new Set(last.users.map(d => d._id)),
  pets: new Set(last.pets.map(d => d._id)),
  mediaassets: new Set(evidence.providerEvents.filter(e => e.event === 'upload-start').map(e => e.assetId)),
}
const owner = last.users.find(d => d.name === 'Browser owner')._id
const recovery = { run, database, target, records: {}, cleanupComplete: false }
let replica, connection
try {
  // Reuse the exact old loopback port/config so oplog/transaction recovery runs
  // as the original replica set, not as an unrelated standalone database.
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.17' }, instanceOpts: [{ dbPath: target, port: 9835 }], replSet: { name: `fyp_transactions_${run}`, count: 1, ip: '127.0.0.1', storageEngine: 'wiredTiger' } })
  const uri = replica.getUri(database)
  assert.equal(new URL(uri).hostname, '127.0.0.1'); assert.equal(new URL(uri).port, '9835')
  connection = await mongoose.createConnection(uri, { dbName: database, autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000 }).asPromise()
  assert.equal(connection.name, database)
  assert.equal((await connection.db.admin().command({ hello: 1 })).setName, `fyp_transactions_${run}`)
  const dbs = await connection.db.admin().listDatabases({ nameOnly: true })
  assert.ok(dbs.databases.every(d => ['admin', 'config', 'local', database].includes(d.name)))
  for (const { name } of await connection.db.listCollections().toArray()) {
    const fields = name === 'mediauploadbudgets' ? { _id: 1, user: 1 } : { _id: 1 }
    const rows = await connection.db.collection(name).find({}, { projection: fields }).toArray()
    if (name === 'mediauploadbudgets') assert.ok(rows.length <= 1 && rows.every(d => String(d.user) === owner))
    else assert.ok(rows.every(d => allowed[name]?.has(String(d._id))), `Unexpected fixture in ${name}; recovery refused`)
    recovery.records[name] = rows.map(d => String(d._id))
  }
  recovery.final = {
    users: await connection.db.collection('users').find({}, { projection: { _id: 1, name: 1, avatar: 1 } }).toArray(),
    pets: await connection.db.collection('pets').find({}, { projection: { _id: 1, name: 1, reportedBy: 1, imageIds: 1, submissionId: 1 } }).toArray(),
    assets: await connection.db.collection('mediaassets').find({}, { projection: { _id: 1, uploadedBy: 1, purpose: 1, state: 1, attachedTo: 1, failureCode: 1, idempotencyKey: 1 } }).toArray(),
  }
  await writeFile(new URL('recovery.json', folder), JSON.stringify(recovery, null, 2))
  for (const [name, ids] of Object.entries(recovery.records)) {
    if (ids.length) await connection.db.collection(name).deleteMany({ _id: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) } })
    assert.equal(await connection.db.collection(name).countDocuments({}), 0)
  }
  recovery.emptyCollectionsVerified = true
  await connection.close(); connection = null
  await replica.stop({ doCleanup: false }); replica = null
  await rm(target, { recursive: true })
  recovery.cleanupComplete = true
  recovery.mockProvider = 'Original process was stopped; its provider was memory-only. No real provider objects existed. No provider lookup/deletion is claimed for interrupted teardown.'
  console.log(JSON.stringify({ database, removed: Object.fromEntries(Object.entries(recovery.records).filter(([,ids]) => ids.length).map(([name, ids]) => [name, ids.length])), cleanupComplete: true }))
} finally {
  await connection?.close(); await replica?.stop({ doCleanup: false })
  await writeFile(new URL('recovery.json', folder), JSON.stringify(recovery, null, 2))
}
