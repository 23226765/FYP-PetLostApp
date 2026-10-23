import { MongoMemoryReplSet } from 'mongodb-memory-server-core'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { validateLocalTransactionUri } from '../tests/helpers/localTransactions.js'

// Never import dotenv, application startup, seeds, migration or cleanup scripts.
// Do not inherit application/provider credentials or binary/URI overrides.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/MONGO|CLOUDINARY|SECRET|PASSWORD|TOKEN|DOTENV|^MEDIA_E2E_|^NODE_OPTIONS$|^DEBUG$/i.test(key)))
Object.assign(env, { ALLOW_TEST_SEED: 'false', NODE_ENV: 'test' })
const realProvider = process.argv.includes('--cloudinary')
if (realProvider && !process.argv.includes('--confirm-isolated-cloudinary-writes')) {
  console.error('No action taken: real provider verification requires explicit temporary upload/delete approval.')
  process.exit(1)
}
for (const key of Object.keys(process.env)) {
  if (/^MONGOMS_|^DEBUG$/i.test(key)) delete process.env[key]
}

let replica, child
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM')
    await new Promise((resolve) => child.once('exit', resolve))
  }
  if (replica) await replica.stop()
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  void stop().then(() => process.exit(1))
})

try {
  const name = `fyp_transactions_${randomUUID().replaceAll('-', '')}`
  replica = new MongoMemoryReplSet({
    binary: { version: '8.0.17', checkMD5: true },
    replSet: { name, count: 1, ip: '127.0.0.1', storageEngine: 'wiredTiger' },
  })
  await replica.start()
  await replica.waitUntilRunning()
  const uri = replica.getUri(name)
  validateLocalTransactionUri(uri)
  env.MEDIA_TEST_MONGODB_URI = uri
  if (realProvider) env.MEDIA_E2E_RUN_ID = name.slice('fyp_transactions_'.length)
  console.log(`Real MongoDB 8.0.17 / single-node WiredTiger replica set / loopback only. Cloudinary ${realProvider ? 'real, exact temporary objects only' : 'mocked'}.`)
  const serverDirectory = fileURLToPath(new URL('../', import.meta.url))
  const code = await new Promise((resolve, reject) => {
    const args = realProvider
      ? ['--experimental-test-module-mocks', 'scripts/verifyManagedImagesE2E.js', '--confirm-isolated-cloudinary-writes']
      : ['--experimental-test-module-mocks', '--test', '--test-timeout=120000', 'tests/mediaTransactions.test.js', 'tests/sightingTransactions.test.js', 'tests/mediaQuotaTransactions.test.js', 'tests/rescueTransactions.test.js', 'tests/rescueEditTransactions.test.js', 'tests/hotspotMongo.test.js']
    child = spawn(process.execPath, args, {
      cwd: serverDirectory, env, stdio: 'inherit', windowsHide: true,
    })
    // Provider runs own a durable exact-ID ledger and handle termination through
    // cleanup. Never stop their replica set before their cleanup finishes.
    const deadline = realProvider ? undefined : setTimeout(() => { child.kill(); reject(new Error('Transaction suite exceeded its time limit.')) }, 180000)
    child.once('error', (error) => { clearTimeout(deadline); reject(error) })
    child.once('exit', (exitCode) => { clearTimeout(deadline); resolve(exitCode ?? 1) })
  })
  process.exitCode = code
} catch {
  console.error('Isolated transaction verification failed. Application configuration and credentials were not loaded.')
  process.exitCode = 1
} finally {
  await stop()
  console.log('Owned temporary replica set stopped; its disposable storage removed. No Atlas connection or application cleanup performed.')
}
