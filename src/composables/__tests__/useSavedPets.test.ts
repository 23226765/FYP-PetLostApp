import { beforeEach, describe, expect, it, vi } from 'vitest'
import { activateSavedPetsAccount, useSavedPets } from '../useSavedPets'
import { captureAuthContext, invalidateAuthContext, setSessionToken } from '../../services/authSession'

const key = (id?: string) => `pawradar_saved_pets:v2:${id ? 'user:' + id : 'guest'}`
const store = useSavedPets()
function login(id: string) { setSessionToken(`isolated-session-${id}`); expect(activateSavedPetsAccount(id, captureAuthContext())).toBe(true) }
describe('local saved IDs are isolated by verified identity', () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); setSessionToken(null) })

  it('keeps guest, A and B separate across logout/relogin; never assigns unattributable legacy IDs', () => {
    localStorage.setItem('pawradar_saved_pets', JSON.stringify(['legacy-unattributable']))
    invalidateAuthContext()
    expect(store.savedPetIds.value).toEqual([])
    store.toggleSave('guest-pet')
    login('account-A'); expect(store.savedPetIds.value).toEqual([]); store.toggleSave('A-pet')
    login('account-B'); expect(store.savedPetIds.value).toEqual([]); store.toggleSave('B-pet')
    setSessionToken(null); expect(store.savedPetIds.value).toEqual(['guest-pet'])
    login('account-A'); expect(store.savedPetIds.value).toEqual(['A-pet'])
    expect(localStorage.getItem('pawradar_saved_pets')).toBe('["legacy-unattributable"]')
    for (const [id, expected] of [[undefined, ['guest-pet']], ['account-A', ['A-pet']], ['account-B', ['B-pet']]] as const) {
      expect(JSON.parse(localStorage.getItem(key(id))!)).toEqual(expected)
    }
  })

  it('clears immediately into pending for a replacement token and rejects late identity activation', () => {
    login('account-A'); store.toggleSave('A-private-post')
    const old = captureAuthContext()
    setSessionToken('isolated-unverified-B')
    expect(store.savedPetIds.value).toEqual([])
    expect(store.savedContext.value.ready).toBe(false)
    expect(store.toggleSave('must-not-save')).toBe(false)
    expect(activateSavedPetsAccount('account-A', old)).toBe(false)
    expect(store.savedContext.value.key).toBeNull()
    expect(activateSavedPetsAccount('account-B', captureAuthContext())).toBe(true)
    expect(store.savedPetIds.value).toEqual([])
  })

  it('preserves only a verified same-token identity during cancellation, while rotating the display revision', () => {
    login('account-A'); store.toggleSave('A-pet')
    const revision = store.savedContext.value.revision
    invalidateAuthContext()
    expect(store.savedContext.value.revision).toBeGreaterThan(revision)
    expect(store.savedContext.value.accountId).toBe('account-A')
    expect(store.savedPetIds.value).toEqual(['A-pet'])
    setSessionToken(null); setSessionToken('isolated-session-account-A')
    expect(store.savedContext.value.ready).toBe(false) // No reuse after logout.
  })

  it('ignores other-account events, stale payloads, sessionStorage, and old events after switching back', () => {
    login('account-A'); store.toggleSave('A-pet')
    login('account-B'); store.toggleSave('B-pet')
    window.dispatchEvent(new StorageEvent('storage', { key: key('account-A'), newValue: '["A-old"]' }))
    expect(store.savedPetIds.value).toEqual(['B-pet'])
    localStorage.setItem(key('account-B'), '["B-newest"]')
    window.dispatchEvent(new StorageEvent('storage', { key: key('account-B'), newValue: '["B-obsolete"]', storageArea: localStorage }))
    expect(store.savedPetIds.value).toEqual(['B-newest'])
    window.dispatchEvent(new StorageEvent('storage', { key: key('account-B'), newValue: '[]', storageArea: sessionStorage }))
    expect(store.savedPetIds.value).toEqual(['B-newest'])
    login('account-A')
    window.dispatchEvent(new StorageEvent('storage', { key: key('account-A'), newValue: '["A-obsolete"]' }))
    expect(store.savedPetIds.value).toEqual(['A-pet'])
  })

  it('cross-tab token changes fail closed until the new user is confirmed; storage clear selects empty guest', () => {
    login('account-A'); store.toggleSave('A-pet')
    localStorage.setItem('token', 'isolated-cross-tab-B')
    window.dispatchEvent(new StorageEvent('storage', { key: 'token', oldValue: 'isolated-session-account-A', newValue: 'isolated-cross-tab-B', storageArea: localStorage }))
    expect(store.savedPetIds.value).toEqual([])
    expect(store.savedContext.value.ready).toBe(false)
    expect(activateSavedPetsAccount('account-B', captureAuthContext())).toBe(true)
    store.toggleSave('B-pet')
    localStorage.clear()
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }))
    expect(store.savedContext.value.accountId).toBeNull()
    expect(store.savedPetIds.value).toEqual([])
  })

  it('forgets identity after rapid external A→B→A even if queued events see the original token again', () => {
    login('account-A'); store.toggleSave('A-pet')
    const tokenA = localStorage.getItem('token')!
    // Both remote writes completed before this tab receives the first event.
    window.dispatchEvent(new StorageEvent('storage', { key: 'token', oldValue: tokenA, newValue: 'isolated-B', storageArea: localStorage }))
    expect(store.savedContext.value.ready).toBe(false)
    expect(store.savedPetIds.value).toEqual([])
    window.dispatchEvent(new StorageEvent('storage', { key: 'token', oldValue: 'isolated-B', newValue: tokenA, storageArea: localStorage }))
    expect(store.savedContext.value.ready).toBe(false)
    expect(activateSavedPetsAccount('account-A', captureAuthContext())).toBe(true)
    expect(store.savedPetIds.value).toEqual(['A-pet'])
  })

  it('stores IDs only, validates malformed input and never overwrites malformed storage just by reading it', () => {
    localStorage.setItem(key(), '["ok","ok",null,{"phone":"PRIVATE_CONTACT"},"../auth/me"," space "]')
    invalidateAuthContext()
    expect(store.savedPetIds.value).toEqual(['ok'])
    expect(store.savedContext.value.storageIssue).toBe(true)
    expect(localStorage.getItem(key())).toContain('PRIVATE_CONTACT') // Read did not rewrite legacy/malformed contents.
    expect(store.toggleSave('../auth/me')).toBe(false)
    store.toggleSave('new-id')
    expect(localStorage.getItem(key())).toBe('["ok","new-id"]')
    expect(store.savedContext.value.storageIssue).toBe(false)
    localStorage.setItem(key(), '{not json')
    window.dispatchEvent(new StorageEvent('storage', { key: key() }))
    expect(store.savedPetIds.value).toEqual([])
    expect(store.savedContext.value.storageIssue).toBe(true)
    expect(localStorage.getItem(key())).toBe('{not json')
  })

  it('survives blocked reads/writes with explicit persistence feedback and context-isolated memory', () => {
    login('account-A')
    const original = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, name) {
      if (name === key('account-A')) throw new Error('Storage unavailable')
      return original.call(this, name)
    })
    invalidateAuthContext()
    expect(store.savedContext.value.storageIssue).toBe(true)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage full') })
    expect(store.toggleSave('memory-only')).toBe(true)
    expect(store.savedPetIds.value).toEqual(['memory-only'])
    expect(store.savedContext.value.storageIssue).toBe(true)
    vi.restoreAllMocks()
    login('account-B')
    expect(store.savedPetIds.value).toEqual([])
  })
})
