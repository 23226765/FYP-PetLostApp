import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test('real-provider harness refuses unapproved or direct invocation without exposing inherited secrets', () => {
  const sentinel = 'Fictional-Never-Print-Harness-Secret'
  const directory = fileURLToPath(new URL('../', import.meta.url))
  for (const args of [['scripts/testTransactions.js', '--cloudinary'], ['scripts/verifyManagedImagesE2E.js']]) {
    const result = spawnSync(process.execPath, args, { cwd: directory, encoding: 'utf8', timeout: 15000, windowsHide: true,
      env: { ...process.env, MEDIA_E2E_RUN_ID: '', MONGODB_URI: `mongodb+srv://${sentinel}@example.test/petlostapp`,
        CLOUDINARY_API_SECRET: sentinel, JWT_SECRET: sentinel, ALLOW_TEST_SEED: 'false' },
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /No action taken/)
    assert.ok(!`${result.stdout}${result.stderr}`.includes(sentinel))
    assert.ok(!result.stdout.includes('Real API + database'))
  }
})
