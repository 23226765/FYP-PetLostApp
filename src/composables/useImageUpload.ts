import { onScopeDispose, reactive } from 'vue'
import { uploadManagedImage, discardManagedImage, type ImagePurpose } from '../services/api'
import { translateApiError, i18n } from '../i18n'
import { secureRequestId } from '../utils/secureRequestId'
import { captureAuthContext, isAuthContextCurrent, type AuthContext } from '../services/authSession'

export function createImageRequestId() { return secureRequestId() }
export function useImageUpload(purpose: ImagePurpose) {
  let source: Blob | string | null = null
  let sourceContext: AuthContext | null = null
  let controller: AbortController | null = null
  let key = ''
  let generation = 0
  let objectUrl = ''
  let disposed = false
  const state = reactive({ preview: '', id: '', progress: 0, uploading: false, error: '' })
  function cancel() {
    generation++
    controller?.abort(); controller = null
    state.uploading = false
    state.error = i18n.global.t('media.cancelled')
  }
  function reset(discard = true) {
    const id = state.id
    cancel()
    if (discard && id && sourceContext && isAuthContextCurrent(sourceContext)) void discardManagedImage(id).catch(() => undefined)
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = ''; source = null; sourceContext = null; key = ''
    Object.assign(state, { preview: '', id: '', progress: 0, error: '' })
  }
  function select(value: Blob | string) {
    if (disposed) return
    reset()
    source = value
    sourceContext = captureAuthContext()
    if (value instanceof Blob) { objectUrl = URL.createObjectURL(value); state.preview = objectUrl }
    else state.preview = value
  }
  async function ensure(): Promise<string[]> {
    if (disposed) throw Object.assign(new Error('Cancelled'), { apiCode: 'IMAGE_CANCELLED' })
    if (!source) return []
    const context = sourceContext
    if (!context?.token || !isAuthContextCurrent(context)) throw Object.assign(new Error('Authentication required'), { apiCode: 'AUTH_CONTEXT_CHANGED' })
    if (state.id) return [state.id]
    if (state.uploading) throw new Error('Image upload already in progress')
    const version = generation
    let active: AbortController | null = null
    state.uploading = true; state.error = ''; state.progress = 0
    try {
      key ||= createImageRequestId()
      controller = new AbortController()
      active = controller
      // Data URLs are local camera previews only; the server receives multipart bytes.
      const file = source instanceof Blob ? source : /^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(source)
        ? await (await fetch(source, { signal: active.signal })).blob() : null
      if (generation !== version || !isAuthContextCurrent(context) || active.signal.aborted) {
        throw Object.assign(new Error('Cancelled'), { apiCode: 'IMAGE_CANCELLED' })
      }
      if (!file || file.size > 8 * 1024 * 1024) throw Object.assign(new Error('Invalid image'), { apiCode: 'IMAGE_TOO_LARGE' })
      const options = { signal: active.signal,
        onProgress: (percent: number) => { if (generation === version && isAuthContextCurrent(context)) state.progress = percent } }
      let image
      try { image = await uploadManagedImage(file, purpose, key, options) }
      catch (error) {
        // Only the server can confirm a prior reservation is terminal. Never
        // rotate after an uncertain network outcome or an in-progress upload.
        if ((error as { apiCode?: string })?.apiCode !== 'IMAGE_UPLOAD_RETRY_REQUIRED' || generation !== version || !isAuthContextCurrent(context) || active.signal.aborted) throw error
        key = createImageRequestId()
        image = await uploadManagedImage(file, purpose, key, options)
      }
      if (generation !== version || !isAuthContextCurrent(context) || active.signal.aborted) {
        // Never issue a stale cancellation under another account's token.
        if (isAuthContextCurrent(context)) void discardManagedImage(image.id).catch(() => undefined)
        throw Object.assign(new Error('Cancelled'), { apiCode: 'IMAGE_CANCELLED' })
      }
      state.id = image.id
      return [image.id]
    } catch (error) {
      // Transport failures retain the key (the upload may have succeeded).
      // Explicit provider failures have been compensated or retained in the
      // recovery ledger; a new attempt must not reuse that terminal reservation.
      const code = (error as { apiCode?: string })?.apiCode
      if (generation === version && isAuthContextCurrent(context) && ['IMAGE_STORAGE_UNAVAILABLE', 'IMAGE_STORAGE_CONFLICT'].includes(code || '')) key = ''
      if (generation === version && isAuthContextCurrent(context)) state.error = translateApiError(error, active?.signal.aborted ? 'media.cancelled' : 'media.uploadFailed')
      throw error
    } finally { if (generation === version) { state.uploading = false; controller = null } }
  }
  function authChanged(event: Event) {
    if (event instanceof StorageEvent && event.key !== null && event.key !== 'token') return
    reset(false)
  }
  window.addEventListener('auth:changed', authChanged)
  window.addEventListener('auth:unauthorized', authChanged)
  window.addEventListener('storage', authChanged)
  onScopeDispose(() => {
    disposed = true
    reset()
    window.removeEventListener('auth:changed', authChanged)
    window.removeEventListener('auth:unauthorized', authChanged)
    window.removeEventListener('storage', authChanged)
  })
  return Object.assign(state, { select, ensure, cancel, reset, finish: () => reset(false) })
}
