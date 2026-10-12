export interface AuthContext {
  token: string | null
  generation: number
}

let generation = 0

export function storedSessionToken(): string | null {
  try { return localStorage.getItem('token') } catch { return null }
}

export function captureAuthContext(): AuthContext {
  return { token: storedSessionToken(), generation }
}

export function isAuthContextCurrent(context: AuthContext): boolean {
  return context.generation === generation && context.token === storedSessionToken()
}

export function invalidateAuthContext() {
  generation += 1
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('auth:changed'))
}

export function setSessionToken(token: string | null) {
  if (token) localStorage.setItem('token', token)
  else localStorage.removeItem('token')
  invalidateAuthContext()
}

export function authContextError() {
  return Object.assign(new Error('Authorization context changed.'), { apiCode: 'AUTH_CONTEXT_CHANGED' })
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.storageArea && event.storageArea !== localStorage) return
    if (event.key !== null && event.key !== 'token') return
    if (event.key === 'token' && event.oldValue === event.newValue) return
    invalidateAuthContext()
    window.dispatchEvent(new Event('auth:external-change'))
  })
}
