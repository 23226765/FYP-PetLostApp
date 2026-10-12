import { readManagedImage } from '../services/api'
import { captureAuthContext, isAuthContextCurrent } from '../services/authSession'
import { protectedImagePath } from './managedImages'

/** Leaflet owns these DOM nodes, so Vue's ManagedImage component cannot mount
 * directly. Use the same authenticated blob delivery and explicit teardown. */
export function createProtectedMapImages() {
  const records = new Map<HTMLImageElement, { controller: AbortController; url: string; source: string }>()
  let disposed = false
  function release(image: HTMLImageElement) {
    const record = records.get(image)
    if (!record) return
    record.controller.abort()
    if (record.url) URL.revokeObjectURL(record.url)
    image.removeAttribute('src')
    records.delete(image)
  }
  const loader = {
    async load(image: HTMLImageElement, source: string) {
      const path = protectedImagePath(source)
      if (!path || disposed) return
      release(image)
      const context = captureAuthContext()
      const record = { controller: new AbortController(), url: '', source }
      records.set(image, record)
      try {
        const blob = await readManagedImage(path, record.controller.signal)
        if (disposed || record.controller.signal.aborted || !isAuthContextCurrent(context) || !image.isConnected || records.get(image) !== record) return
        record.url = URL.createObjectURL(blob)
        image.hidden = false
        image.src = record.url
      } catch {
        if (records.get(image) === record && !record.controller.signal.aborted) image.dispatchEvent(new Event('error'))
      } finally {
        if (records.get(image) === record && !image.isConnected) release(image)
      }
    },
    prune() { for (const image of records.keys()) if (!image.isConnected) release(image) },
    clear(reload = false) {
      const previous = [...records]
      for (const [image] of previous) { release(image); image.dispatchEvent(new Event('error')) }
      // Reload only through the new authorization context. No marker/map
      // recreation is necessary when a guest merely cancels authentication.
      if (reload && !disposed) for (const [image, record] of previous) {
        if (image.isConnected) void loader.load(image, record.source)
      }
    },
    dispose() { disposed = true; for (const image of [...records.keys()]) release(image) },
  }
  return loader
}
