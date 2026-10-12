<template><img ref="imageEl" v-bind="$attrs" :src="resolved || undefined" @error="emit('error', $event)" /></template>
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { readManagedImage } from '../services/api'
import { protectedImagePath } from '../utils/managedImages'
defineOptions({ inheritAttrs: false })
const props = defineProps<{ src?: string }>()
const emit = defineEmits<{ error: [event: Event] }>()
const resolved = ref('')
const imageEl = ref<HTMLImageElement | null>(null)
let controller: AbortController | null = null
let objectUrl = '', version = 0
function clear() {
  version++; controller?.abort(); controller = null
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = ''; resolved.value = ''
}
async function load() {
  clear()
  const path = props.src ? protectedImagePath(props.src) : null
  if (!path) { resolved.value = props.src || ''; return }
  const current = version
  controller = new AbortController()
  try {
    const blob = await readManagedImage(path, controller.signal)
    if (current !== version) return
    objectUrl = URL.createObjectURL(blob); resolved.value = objectUrl
  } catch {
    if (current !== version) return
    // A real DOM error event preserves existing placeholder handlers.
    imageEl.value?.dispatchEvent(new Event('error'))
  }
}
function authChanged(event: Event) {
  if (event instanceof StorageEvent && event.key !== null && event.key !== 'token') return
  void load()
}
watch(() => props.src, load, { immediate: true })
window.addEventListener('auth:changed', authChanged)
window.addEventListener('auth:unauthorized', authChanged)
window.addEventListener('storage', authChanged)
onBeforeUnmount(() => {
  clear()
  window.removeEventListener('auth:changed', authChanged)
  window.removeEventListener('auth:unauthorized', authChanged)
  window.removeEventListener('storage', authChanged)
})
</script>
