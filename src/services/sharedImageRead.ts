import { readManagedImage } from './api'
import { authContextError, captureAuthContext, isAuthContextCurrent, type AuthContext } from './authSession'

interface PendingRead {
  context: AuthContext
  controller: AbortController
  consumers: number
  promise: Promise<Blob>
}
// Only simultaneous reads share bytes. Later views recheck delivery permission.
const pending = new Map<string, PendingRead>()
export function acquireImageRead(path: string) {
  let entry = pending.get(path)
  if (!entry || !isAuthContextCurrent(entry.context)) {
    entry?.controller.abort()
    const context = captureAuthContext()
    const controller = new AbortController()
    const promise = readManagedImage(path, controller.signal).then(blob => {
      if (controller.signal.aborted || !isAuthContextCurrent(context)) throw authContextError()
      return blob
    }).finally(() => {
      if (pending.get(path)?.controller === controller) pending.delete(path)
    })
    entry = { context, controller, consumers: 0, promise }
    pending.set(path, entry)
  }
  const shared = entry
  shared.consumers++
  let released = false
  return { promise: shared.promise, release() {
    if (released) return
    released = true
    if (--shared.consumers === 0 && pending.get(path) === shared) {
      pending.delete(path)
      shared.controller.abort()
    }
  } }
}

