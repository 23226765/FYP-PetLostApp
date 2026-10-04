import { describe, expect, it } from 'vitest'
import appSource from '../../App.vue?raw'

function functionSource(name: string, nextName: string): string {
  const start = appSource.indexOf(`function ${name}`)
  const end = appSource.indexOf(`function ${nextName}`, start + 1)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return appSource.slice(start, end)
}

describe('notification preference synchronization', () => {
  it('does not persist notification preferences as a side effect of loading pets', () => {
    const source = functionSource('loadPets', 'onRadiusChange')
    expect(source).not.toContain('syncNotificationPreferences')
  })

  it('loads location-backed pet data before activating notifications after login', () => {
    const source = functionSource('handleAuth', 'logout')
    expect(source.indexOf('await loadPets()')).toBeGreaterThanOrEqual(0)
    expect(source.indexOf('await activateNotifications()')).toBeGreaterThan(
      source.indexOf('await loadPets()'),
    )
  })

  it('clears every authorization-scoped location cache during account transitions', () => {
    const source = functionSource('clearAuthorizationScopedState', 'clearToastTimers')
    for (const reset of [
      'pets.value = []',
      'selectedPet.value = null',
      'posterPet.value = null',
      'toastPet.value = null',
      'sightingPet.value = null',
      'sightingCoordinates.value = null',
      'userLocation.value = null',
      'hasPreciseLocation.value = false',
    ]) {
      expect(source).toContain(reset)
    }
    expect(source).toContain('petsAbortController?.abort()')
  })

  it('uses the same authorization cache reset for login, logout, and forced logout', () => {
    expect(functionSource('handleAuth', 'logout')).toContain('clearAuthorizationScopedState()')
    expect(functionSource('logout', 'clearAuthorizationScopedState')).toContain(
      'clearAuthorizationScopedState()',
    )
    const unauthorizedStart = appSource.indexOf('function handleUnauthorized')
    const unauthorizedEnd = appSource.indexOf('onMounted(() =>', unauthorizedStart)
    expect(unauthorizedStart).toBeGreaterThanOrEqual(0)
    expect(unauthorizedEnd).toBeGreaterThan(unauthorizedStart)
    expect(appSource.slice(unauthorizedStart, unauthorizedEnd)).toContain(
      'clearAuthorizationScopedState()',
    )
  })
})
