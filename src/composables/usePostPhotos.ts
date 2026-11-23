import { computed, effectScope, onScopeDispose, ref, shallowRef, type EffectScope } from 'vue'
import { i18n } from '../i18n'
import { displayImageUrl } from '../utils/imagePresentation'
import { useImageUpload } from './useImageUpload'
import type { PostImageAttachment } from '../services/api'

interface DraftPhoto {
  key: number
  preview: string
  existingUrl?: string
  upload?: ReturnType<typeof useImageUpload>
  scope?: EffectScope
}

export function usePostPhotos(purpose: 'pet' | 'stray') {
  const items = shallowRef<DraftPhoto[]>([])
  const busy = ref(false)
  const error = ref('')
  let sequence = 0
  let revision = 0
  const progress = computed(() => {
    const uploads = items.value.flatMap(item => item.upload ? [item.upload] : [])
    return uploads.length ? Math.round(uploads.reduce((sum, upload) => sum + (upload.id ? 100 : upload.progress), 0) / uploads.length) : 0
  })
  function cancel() {
    revision++
    for (const item of items.value) if (item.upload?.uploading) item.upload.cancel()
    busy.value = false
  }
  function reset(urls: string[] = [], discard = true) {
    cancel()
    for (const item of items.value) {
      if (!discard) item.upload?.finish()
      item.scope?.stop()
    }
    items.value = [...new Set(urls.filter(Boolean))].map(existingUrl => ({ key: ++sequence, preview: displayImageUrl(existingUrl), existingUrl }))
    error.value = ''
  }
  function sessionChanged(event: Event) {
    if (event instanceof StorageEvent && event.key !== null && event.key !== 'token') return
    reset([], false)
  }
  const events = ['auth:changed', 'auth:unauthorized', 'storage']
  for (const name of events) window.addEventListener(name, sessionChanged)
  onScopeDispose(() => {
    for (const name of events) window.removeEventListener(name, sessionChanged)
    reset()
  })
  function addFiles(files: File[]) {
    if (busy.value) return
    if (items.value.length + files.length > 4) { error.value = i18n.global.t('postPhotos.limit'); return }
    const mb = purpose === 'stray' ? 5 : 8
    if (files.some(f => !['image/jpeg','image/png','image/webp'].includes(f.type) || f.size > mb * 1024 * 1024)) {
      error.value = i18n.global.t('postPhotos.invalid', { mb }); return
    }
    error.value = ''
    for (const file of files) {
      const scope = effectScope(true)
      const upload = scope.run(() => useImageUpload(purpose))!
      upload.select(file)
      items.value = [...items.value, { key: ++sequence, preview: upload.preview, upload, scope }]
    }
  }
  function remove(index: number) {
    if (busy.value) return
    items.value[index]?.scope?.stop()
    items.value = items.value.filter((_, i) => i !== index)
    error.value = ''
  }
  function move(index: number, delta: number) {
    const next = [...items.value], target = index + delta
    if (busy.value || !next[index] || !next[target]) return
    ;[next[index], next[target]] = [next[target], next[index]]
    items.value = next
  }
  async function attachments(): Promise<PostImageAttachment[]> {
    if (busy.value) throw new Error('Upload already in progress')
    const version = ++revision
    busy.value = true
    error.value = ''
    const result: PostImageAttachment[] = []
    try {
      for (const item of items.value) {
        if (item.existingUrl) result.push({ existingUrl: item.existingUrl })
        else {
          const [imageId] = await item.upload!.ensure()
          if (!imageId || version !== revision) throw Object.assign(new Error('Cancelled'), { apiCode: 'IMAGE_CANCELLED' })
          result.push({ imageId })
        }
      }
      return result
    } finally { if (version === revision) busy.value = false }
  }
  return { items, busy, progress, error, reset, cancel, move, remove, addFiles, attachments,
    finish: () => reset([], false),
    ensure: async () => (await attachments()).flatMap(item => 'imageId' in item ? [item.imageId] : []) }
}

