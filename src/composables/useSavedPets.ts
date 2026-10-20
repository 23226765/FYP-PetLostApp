import { computed, readonly, shallowRef } from 'vue'
import { captureAuthContext, isAuthContextCurrent, type AuthContext } from '../services/authSession'

// Legacy pawradar_saved_pets is intentionally never read, assigned or removed:
// its owner is unknowable. No automatic import into guest or account namespaces.
const PREFIX = 'pawradar_saved_pets:v2:'
interface SavedContext {
  key: string | null
  accountId: string | null
  ready: boolean
  revision: number
  ids: string[]
  storageIssue: boolean
}
const state = shallowRef<SavedContext>({ key: null, accountId: null, ready: false, revision: 0, ids: [], storageIssue: false })
let initialized = false
let context: AuthContext | null = null
let verifiedAccount: { id: string; token: string } | null = null

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
}
function readIds(key: string): { ids: string[]; storageIssue: boolean } {
  try {
    const value = localStorage.getItem(key)
    if (value === null) return { ids: [], storageIssue: false }
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return { ids: [], storageIssue: true }
    return { ids: [...new Set(parsed.filter(validId))], storageIssue: parsed.some(id => !validId(id)) }
  } catch { return { ids: [], storageIssue: true } }
}
function selectNamespace(accountId: string | null, ready: boolean) {
  const key = ready ? PREFIX + (accountId ? 'user:' + encodeURIComponent(accountId) : 'guest') : null
  state.value = { key, accountId, ready, revision: state.value.revision + 1,
    ...(key ? readIds(key) : { ids: [], storageIssue: false }) }
}
function resetContext() {
  context = captureAuthContext()
  // Keep only a previously CONFIRMED, in-memory identity for the exact same
  // token (e.g. cancelled authentication). Token changes discard this binding.
  if (!context.token || verifiedAccount?.token !== context.token) verifiedAccount = null
  selectNamespace(verifiedAccount?.id || null, !context.token || Boolean(verifiedAccount))
}
function handleAuthChange(event: Event) {
  // External A→B→A can finish before either storage event is delivered. The
  // current token alone cannot prove that no account transition intervened.
  if ((event as CustomEvent<{ external?: boolean }>).detail?.external) verifiedAccount = null
  resetContext()
}
function synchronizeContext() {
  if (!context || !isAuthContextCurrent(context)) resetContext()
}
function handleStorage(event: StorageEvent) {
  try { if (event.storageArea && event.storageArea !== localStorage) return } catch { return }
  synchronizeContext()
  if (!state.value.ready || !state.value.key || (event.key !== null && event.key !== state.value.key)) return
  // The queued event payload may belong to an obsolete write/session. Reread
  // current storage instead; events never establish an authenticated identity.
  state.value = { ...state.value, ...readIds(state.value.key), revision: state.value.revision + 1 }
}
function initialize() {
  if (!initialized && typeof window !== 'undefined') {
    initialized = true
    window.addEventListener('auth:changed', handleAuthChange)
    window.addEventListener('storage', handleStorage)
  }
  synchronizeContext()
}

/** Only App's successful current-user/login flow may activate an account. */
export function activateSavedPetsAccount(accountId: string, authContext: AuthContext): boolean {
  initialize()
  if (!validId(accountId) || !authContext.token || !isAuthContextCurrent(authContext)) return false
  verifiedAccount = { id: accountId, token: authContext.token }
  context = authContext
  selectNamespace(accountId, true)
  return true
}

function isSaved(petId: string): boolean {
  synchronizeContext()
  return state.value.ready && state.value.ids.includes(petId)
}
function toggleSave(petId: string): boolean {
  synchronizeContext()
  const snapshot = state.value
  if (!snapshot.ready || !snapshot.key || !validId(petId)) return false
  const ids = snapshot.ids.includes(petId) ? snapshot.ids.filter(id => id !== petId) : [...snapshot.ids, petId]
  let storageIssue = false
  try { localStorage.setItem(snapshot.key, JSON.stringify(ids)) } catch { storageIssue = true }
  if (!context || !isAuthContextCurrent(context) || state.value !== snapshot) return false
  state.value = { ...snapshot, ids, storageIssue, revision: snapshot.revision + 1 }
  return ids.includes(petId)
}

export function useSavedPets() {
  initialize()
  return { savedPetIds: computed(() => state.value.ids), savedContext: readonly(state), isSaved, toggleSave }
}
