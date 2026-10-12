import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { getProfile } from '../api'
import { invalidateAuthContext, setSessionToken } from '../authSession'

const transport = vi.hoisted(() => vi.fn())
vi.mock('axios', async (original) => {
  const module = await original<typeof import('axios')>()
  return { ...module, default: { ...module.default, create: (config: object) => module.default.create({ ...config, adapter: transport }) } }
})

describe('real Axios interceptors with isolated transport fixtures', () => {
  beforeEach(() => { localStorage.clear(); invalidateAuthContext(); transport.mockReset() })
  it.each([503, undefined])('temporary failure (%s) retains credentials and status', async (status) => {
    setSessionToken('fixture-session')
    transport.mockImplementation((config: InternalAxiosRequestConfig) => Promise.reject(new AxiosError('fixture outage', undefined, config, undefined,
      status ? { config, status, statusText: 'Unavailable', headers: {}, data: { code: 'AUTH_SERVICE_UNAVAILABLE' } } : undefined)))
    await expect(getProfile()).rejects.toMatchObject({ status })
    expect(localStorage.getItem('token')).toBe('fixture-session')
  })
  it('a genuine /auth/me 401 clears the session, unlike failed login credentials', async () => {
    setSessionToken('invalid-fixture')
    transport.mockImplementation((config: InternalAxiosRequestConfig) => Promise.reject(new AxiosError('invalid', undefined, config, undefined,
      { config, status: 401, statusText: 'Unauthorized', headers: {}, data: {} })))
    await expect(getProfile()).rejects.toMatchObject({ status: 401 })
    expect(localStorage.getItem('token')).toBeNull()
  })
  it.each(['success', 'failure'])('same-token invalidation rejects stale %s without changing the new context', async (outcome) => {
    setSessionToken('fixture-session')
    let finish!: () => void
    transport.mockImplementation((config: InternalAxiosRequestConfig) => new Promise((resolve, reject) => {
      finish = () => outcome === 'success'
        ? resolve({ config, status: 200, statusText: 'OK', headers: {}, data: { user: { id: 'obsolete' } } })
        : reject(new AxiosError('obsolete unauthorized', undefined, config, undefined, { config, status: 401, statusText: 'Unauthorized', headers: {}, data: {} }))
    }))
    const request = getProfile()
    await Promise.resolve(); await Promise.resolve()
    invalidateAuthContext()
    finish()
    await expect(request).rejects.toMatchObject({ apiCode: 'AUTH_CONTEXT_CHANGED' })
    expect(localStorage.getItem('token')).toBe('fixture-session')
  })
})
