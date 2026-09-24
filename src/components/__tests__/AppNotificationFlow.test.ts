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
})
