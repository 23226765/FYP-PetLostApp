import test from 'node:test'
import assert from 'node:assert/strict'
import chatRouter from '../routes/chat.js'
import petsRouter from '../routes/pets.js'
import notificationsRouter from '../routes/notifications.js'
import straysRouter from '../routes/strays.js'
import authRouter from '../routes/auth.js'
import matchesRouter from '../routes/matches.js'
import analyticsRouter from '../routes/analytics.js'
import uploadsRouter from '../routes/uploads.js'
import Notification from '../models/Notification.js'

function findRoute(router, path, method) {
  return router.stack.find(
    (layer) => layer.route?.path === path && Boolean(layer.route.methods[method]),
  )?.route
}

function middlewareNames(route) {
  return route?.stack.map((layer) => layer.handle.name) || []
}

test('pet status changes require authentication', () => {
  const route = findRoute(petsRouter, '/:id/status', 'patch')
  assert.ok(route, 'PATCH /:id/status must be registered')
  assert.deepEqual(middlewareNames(route), ['requireAuth', 'updateStatus'])
})

test('radar list and nearby routes apply optional authentication', () => {
  const list = findRoute(petsRouter, '/', 'get')
  const nearby = findRoute(petsRouter, '/nearby', 'get')

  assert.deepEqual(middlewareNames(list), ['optionalAuth', 'listPets'])
  assert.deepEqual(middlewareNames(nearby), ['optionalAuth', 'getNearbyPets'])
})

test('sighting confirmation requires authentication', () => {
  const route = findRoute(petsRouter, '/:id/sightings/:sightingId/confirm', 'post')
  assert.ok(route, 'confirmation route must be registered')
  assert.deepEqual(middlewareNames(route), ['requireAuth', 'confirmSighting'])
})

test('smart match is exposed as one public static endpoint', () => {
  const route = findRoute(petsRouter, '/smart-match', 'post')
  assert.ok(route, 'POST /smart-match must be registered')
  assert.deepEqual(middlewareNames(route), ['optionalAuth', 'smartMatch'])
})

test('candidate matching is available at the frontend contract path', () => {
  const route = findRoute(matchesRouter, '/candidates', 'post')
  assert.ok(route, 'POST /candidates must be registered')
  assert.deepEqual(middlewareNames(route), ['optionalAuth', 'smartMatch'])
})

test('spatial hotspot analytics are available as one public batched endpoint', () => {
  const route = findRoute(analyticsRouter, '/hotspots', 'get')
  assert.ok(route, 'GET /hotspots must be registered')
  assert.deepEqual(middlewareNames(route), ['listHotspots'])
})

test('chat inbox, reads, and writes require authentication', () => {
  const inbox = findRoute(chatRouter, '/inbox', 'get')
  const read = findRoute(chatRouter, '/:petId', 'get')
  const write = findRoute(chatRouter, '/:petId', 'post')

  assert.deepEqual(middlewareNames(inbox), ['requireAuth', 'listConversations'])
  assert.deepEqual(middlewareNames(read), ['requireAuth', 'getMessages'])
  assert.deepEqual(middlewareNames(write), ['requireAuth', 'createMessage'])
})

test('notification inbox, preferences, and read state require authentication', () => {
  const authLayer = notificationsRouter.stack.find((layer) => layer.name === 'requireAuth')
  const inbox = findRoute(notificationsRouter, '/', 'get')
  const preferences = findRoute(notificationsRouter, '/preferences', 'put')
  const readAll = findRoute(notificationsRouter, '/read-all', 'patch')
  const readOne = findRoute(notificationsRouter, '/:id/read', 'patch')

  assert.ok(authLayer, 'notification router must install requireAuth')
  assert.deepEqual(middlewareNames(inbox), ['listNotifications'])
  assert.deepEqual(middlewareNames(preferences), ['updatePreferences'])
  assert.deepEqual(middlewareNames(readAll), ['markAllRead'])
  assert.deepEqual(middlewareNames(readOne), ['markRead'])
})

test('notification schema accepts every application notification type', () => {
  assert.deepEqual(Notification.schema.path('type').enumValues, [
    'proximity',
    'sighting',
    'message',
    'reunited',
    'comment',
  ])
})

test('stray reports are public while ownership actions require authentication', () => {
  const list = findRoute(straysRouter, '/', 'get')
  const nearby = findRoute(straysRouter, '/nearby', 'get')
  const report = findRoute(straysRouter, '/report', 'post')
  const mine = findRoute(straysRouter, '/mine', 'get')
  const status = findRoute(straysRouter, '/:id/status', 'patch')

  const detail = findRoute(straysRouter, '/:id', 'get')

  assert.deepEqual(middlewareNames(list), ['optionalAuth', 'listStrays'])
  assert.deepEqual(middlewareNames(nearby), ['optionalAuth', 'nearbyStrays'])
  assert.deepEqual(middlewareNames(detail), ['optionalAuth', 'getStray'])
  assert.deepEqual(middlewareNames(report), ['requireAuth', 'reportStray'])
  assert.deepEqual(middlewareNames(mine), ['requireAuth', 'listMyStrays'])
  assert.deepEqual(middlewareNames(status), ['requireAuth', 'updateRescueStatus'])
})

test('stray community writes and private saved posts require authentication', () => {
  assert.deepEqual(middlewareNames(findRoute(straysRouter, '/:id/comments', 'get')), ['optionalAuth', 'listComments'])
  assert.deepEqual(middlewareNames(findRoute(straysRouter, '/:id/comments', 'post')), ['requireAuth', 'createComment'])
  assert.deepEqual(middlewareNames(findRoute(straysRouter, '/:id/comments/:commentId', 'patch')), ['requireAuth', 'updateComment'])
  assert.deepEqual(middlewareNames(findRoute(straysRouter, '/:id/comments/:commentId', 'delete')), ['requireAuth', 'deleteComment'])
  assert.deepEqual(middlewareNames(findRoute(straysRouter, '/saved', 'get')), ['requireAuth', 'listSavedStrays'])
  assert.deepEqual(middlewareNames(findRoute(straysRouter, '/:id/saved', 'put')), ['requireAuth', 'saveStray'])
  assert.deepEqual(middlewareNames(findRoute(straysRouter, '/:id/saved', 'delete')), ['requireAuth', 'unsaveStray'])
  assert.deepEqual(middlewareNames(findRoute(straysRouter, '/:id', 'patch')), ['requireAuth', 'updateStray'])
  assert.deepEqual(middlewareNames(findRoute(straysRouter, '/:id', 'delete')), ['requireAuth', 'deleteStray'])
})

test('image upload requires authentication', () => {
  assert.deepEqual(middlewareNames(findRoute(uploadsRouter, '/image', 'post')), ['requireAuth', 'uploadImage'])
})

test('profile updates require authentication', () => {
  const update = findRoute(authRouter, '/me', 'patch')
  assert.deepEqual(middlewareNames(update), ['requireAuth', 'updateMe'])
})

test('contact privacy reads and updates require authentication', () => {
  const read = findRoute(authRouter, '/me/privacy', 'get')
  const update = findRoute(authRouter, '/me/privacy', 'patch')
  assert.deepEqual(middlewareNames(read), ['requireAuth', 'getPrivacy'])
  assert.deepEqual(middlewareNames(update), ['requireAuth', 'updatePrivacy'])
})

test('language and appearance preferences read and update require authentication', () => {
  const read = findRoute(authRouter, '/me/preferences', 'get')
  const update = findRoute(authRouter, '/me/preferences', 'patch')
  assert.deepEqual(middlewareNames(read), ['requireAuth', 'getPreferences'])
  assert.deepEqual(middlewareNames(update), ['requireAuth', 'updatePreferences'])
})

test('public pet details still resolve optional requester identity', () => {
  const detail = findRoute(petsRouter, '/:id', 'get')
  assert.deepEqual(middlewareNames(detail), ['optionalAuth', 'getPet'])
})
