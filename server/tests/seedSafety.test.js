import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import Message from '../models/Message.js'
import Notification from '../models/Notification.js'
import Pet from '../models/Pet.js'
import Sighting from '../models/Sighting.js'
import Stray from '../models/Stray.js'
import User from '../models/User.js'

const scriptsDirectory = new URL('../scripts/', import.meta.url)

test('every seeded model has a private immutable batch marker', () => {
  for (const model of [User, Pet, Stray, Sighting, Message, Notification]) {
    const marker = model.schema.path('seedBatch')
    assert.ok(marker, `${model.modelName} is missing seedBatch`)
    assert.equal(marker.options.select, false)
    assert.equal(marker.options.immutable, true)
  }
})

test('test seed requires explicit permission, password, and exact database', async () => {
  const source = await readFile(new URL('seedTestData.js', scriptsDirectory), 'utf8')
  assert.match(source, /ALLOW_TEST_SEED !== 'true'/)
  assert.match(source, /SEED_USER_PASSWORD/)
  assert.match(source, /connection\.name !== DATABASE_NAME/)
  assert.match(source, /bcrypt\.hash\(password, 10\)/)
  assert.match(source, /findById\(_id\)/)
  assert.doesNotMatch(source, /deleteMany\(/)
})

test('demo users have explicit idempotent privacy choices', async () => {
  const source = await readFile(new URL('seedTestData.js', scriptsDirectory), 'utf8')
  assert.match(source, /key: 'owner'[\s\S]*?contactVisibility: 'authenticated'/)
  assert.match(source, /key: 'finder'[\s\S]*?contactVisibility: 'private'/)
  assert.match(source, /key: 'shelter'[\s\S]*?contactVisibility: 'private'/)
  assert.match(source, /User\.updateOne\(/)
  assert.match(source, /seedBatch: SEED_BATCH/)
})

test('cleanup deletes only the named seed batch', async () => {
  const source = await readFile(new URL('cleanTestSeed.js', scriptsDirectory), 'utf8')
  const scopedDeletes = source.match(/deleteMany\(\{ seedBatch: SEED_BATCH \}\)/g) || []
  assert.equal(scopedDeletes.length, 1)
  assert.match(source, /connection\.name !== DATABASE_NAME/)
  assert.doesNotMatch(source, /deleteMany\(\{\s*\}\)/)
})
