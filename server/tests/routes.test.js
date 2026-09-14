import test from 'node:test'
import assert from 'node:assert/strict'
import chatRouter from '../routes/chat.js'
import petsRouter from '../routes/pets.js'
import notificationsRouter from '../routes/notifications.js'

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

test('sighting confirmation requires authentication', () => {
  const route = findRoute(petsRouter, '/:id/sightings/:sightingId/confirm', 'post')
  assert.ok(route, 'confirmation route must be registered')
  assert.deepEqual(middlewareNames(route), ['requireAuth', 'confirmSighting'])
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
