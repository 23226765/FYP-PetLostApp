<template>
  <img ref="imageEl" v-bind="$attrs" :src="resolved || undefined" :loading="priority ? 'eager' : 'lazy'"
    :fetchpriority="priority ? 'high' : 'auto'" :class="{ 'image-pending': pending }" :aria-busy="pending"
    @load="loaded" @error="failed" />
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { acquireImageRead } from '../services/sharedImageRead'
import { captureAuthContext, isAuthContextCurrent } from '../services/authSession'
import { protectedImagePath } from '../utils/managedImages'
defineOptions({ inheritAttrs: false })
const props = defineProps<{ src?: string; priority?: boolean }>()
const emit = defineEmits<{ error: [event: Event]; load: []; pending: [] }>()
const resolved = ref(props.src && !protectedImagePath(props.src) ? props.src : '')
const pending = ref(Boolean(props.src))
const imageEl = ref<HTMLImageElement>()
let lease: ReturnType<typeof acquireImageRead> | undefined
let observer: IntersectionObserver | undefined
let objectUrl = '', version = 0

function clear() {
  version++
  observer?.disconnect()
  observer = undefined
  lease?.release()
  lease = undefined
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = ''
  resolved.value = ''
}
function loaded() {
  if (!resolved.value) return
  pending.value = false
  emit('load')
}
function failed(event: Event) {
  pending.value = false
  emit('error', event)
}
function start() {
  clear()
  pending.value = Boolean(props.src)
  if (!props.src) return
  emit('pending')
  const path = protectedImagePath(props.src)
  if (!path) { resolved.value = props.src; return }
  const current = version
  const context = captureAuthContext()
  async function read() {
    if (current !== version || !isAuthContextCurrent(context)) return
    observer?.disconnect()
    observer = undefined
    try {
      lease = acquireImageRead(path!)
      const blob = await lease.promise
      if (current !== version || !isAuthContextCurrent(context)) return
      objectUrl = URL.createObjectURL(blob)
      resolved.value = objectUrl
    } catch {
      if (current === version && isAuthContextCurrent(context)) imageEl.value?.dispatchEvent(new Event('error'))
    } finally {
      if (current === version) { lease?.release(); lease = undefined }
    }
  }
  if (props.priority || typeof IntersectionObserver === 'undefined') { void read(); return }
  observer = new IntersectionObserver(entries => {
    if (observer && current === version && entries.some(entry => entry.isIntersecting)) void read()
  }, { rootMargin: '200px 0px' })
  if (imageEl.value) observer.observe(imageEl.value)
}
function sessionChanged(event: Event) {
  clear()
  imageEl.value?.removeAttribute('src')
  if (event.type === 'auth:unauthorized' && props.src && protectedImagePath(props.src)) {
    failed(new Event('error'))
    return
  }
  const current = version
  // Allow the account's old views to unmount before scheduling any new reads.
  void nextTick(() => { if (current === version) start() })
}
onMounted(start)
watch(() => props.src, start)
watch(() => props.priority, high => { if (high && observer) start() })
window.addEventListener('auth:changed', sessionChanged)
window.addEventListener('auth:unauthorized', sessionChanged)
onBeforeUnmount(() => {
  clear()
  window.removeEventListener('auth:changed', sessionChanged)
  window.removeEventListener('auth:unauthorized', sessionChanged)
})
</script>
<style scoped>
.image-pending { color:transparent; background:var(--color-surface-subtle); }
.image-pending:not([src]) { opacity:0; }
</style>
