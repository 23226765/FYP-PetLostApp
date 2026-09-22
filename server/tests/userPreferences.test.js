import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import User from '../models/User.js'
import { updatePreferences } from '../controllers/authController.js'
import {
  DEFAULT_PREFERENCES,
  preferencesFor,
  validatePreferenceUpdate,
} from '../services/userPreferences.js'

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.payload = payload
      return this
    },
  }
}

test('new and legacy users resolve safe default preferences', () => {
  const user = new User({
    name: 'Preference Test',
    email: 'preference-default@example.test',
    password: 'not-a-real-password-hash',
  })
  assert.deepEqual(user.preferences.toObject(), DEFAULT_PREFERENCES)
  assert.deepEqual(preferencesFor({}), DEFAULT_PREFERENCES)
  assert.deepEqual(preferencesFor({ preferences: { language: 'invalid', theme: 'sepia' } }), DEFAULT_PREFERENCES)
})

test('preference validation accepts partial supported values and rejects invalid or extra fields', () => {
  assert.deepEqual(validatePreferenceUpdate({ language: 'zh-HK' }).value, { language: 'zh-HK' })
  assert.deepEqual(validatePreferenceUpdate({ language: 'zh-CN', theme: 'dark' }).value, {
    language: 'zh-CN',
    theme: 'dark',
  })
  assert.equal(validatePreferenceUpdate({ language: 'fr' }).code, 'UNSUPPORTED_LANGUAGE')
  assert.equal(validatePreferenceUpdate({ theme: 'system' }).code, 'UNSUPPORTED_THEME')
  assert.equal(validatePreferenceUpdate({ theme: 'dark', contactVisibility: 'authenticated' }).code, 'UNEXPECTED_PREFERENCE_FIELD')
  assert.equal(validatePreferenceUpdate({}).code, 'EMPTY_PREFERENCES_UPDATE')
})

test('authenticated preference update preserves privacy and other user fields', async () => {
  const user = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Unchanged Name',
    privacy: { contactVisibility: 'authenticated' },
    preferences: { language: 'en', theme: 'light' },
    async save() {},
  }
  const response = responseRecorder()
  await updatePreferences(
    { user, body: { language: 'zh-HK', theme: 'dark' } },
    response,
    (error) => { throw error },
  )
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.payload.preferences, { language: 'zh-HK', theme: 'dark' })
  assert.deepEqual(user.privacy, { contactVisibility: 'authenticated' })
  assert.equal(user.name, 'Unchanged Name')
})

test('preference update returns stable validation codes without mutating the user', async () => {
  const user = {
    preferences: { language: 'en', theme: 'light' },
    async save() { throw new Error('save must not run') },
  }
  for (const [body, code] of [
    [{ language: 'fr' }, 'UNSUPPORTED_LANGUAGE'],
    [{ theme: 'system' }, 'UNSUPPORTED_THEME'],
    [{ language: 'en', role: 'admin' }, 'UNEXPECTED_PREFERENCE_FIELD'],
  ]) {
    const response = responseRecorder()
    await updatePreferences({ user, body }, response, (error) => { throw error })
    assert.equal(response.statusCode, 400)
    assert.equal(response.payload.code, code)
    assert.deepEqual(user.preferences, { language: 'en', theme: 'light' })
  }
})
