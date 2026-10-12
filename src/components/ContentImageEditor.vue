<template>
  <details class="image-editor">
    <summary>{{ t('media.edit') }}</summary>
    <input type="file" accept="image/jpeg,image/png,image/webp" :aria-label="t('media.replace')" :disabled="saving" @change="choose" />
    <ManagedImage v-if="upload.preview" class="preview" :src="upload.preview" :alt="t('pets.selectedPhotoAlt')" />
    <ImageUploadStatus :upload="upload" />
    <div class="actions">
      <button v-if="upload.preview" type="button" :disabled="saving || upload.uploading" @click="save">{{ t('media.retrySave') }}</button>
      <button v-if="allowRemove" type="button" :disabled="saving || upload.uploading" @click="remove">{{ t('media.remove') }}</button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="saved" role="status">{{ t('media.saved') }}</p>
  </details>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { captureAuthContext, isAuthContextCurrent } from '../services/authSession'
import { useImageUpload } from '../composables/useImageUpload'
import { replaceContentImages, type ManagedImage as ManagedImageData } from '../services/api'
import { translateApiError, useAppI18n } from '../i18n'
import ManagedImage from './ManagedImage.vue'
import ImageUploadStatus from './ImageUploadStatus.vue'
const props = withDefaults(defineProps<{ type: 'pet' | 'sighting' | 'stray' | 'message'; id: string; allowRemove?: boolean }>(), { allowRemove: true })
const emit = defineEmits<{ updated: [images: ManagedImageData[]] }>()
const { t } = useAppI18n()
const upload = useImageUpload(props.type)
const saving = ref(false), error = ref(''), saved = ref(false)
let disposed = false
onBeforeUnmount(() => { disposed = true })
watch(() => [props.type, props.id], () => { upload.reset(false); error.value = ''; saved.value = false })
function choose(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]; input.value = ''
  if (file) { upload.select(file); saved.value = false; error.value = '' }
}
async function save() {
  if (saving.value) return
  saving.value = true; error.value = ''; saved.value = false
  const type = props.type, id = props.id
  const context = captureAuthContext()
  const active = () => !disposed && isAuthContextCurrent(context) && props.type === type && props.id === id
  try {
    const ids = await upload.ensure()
    if (!ids.length || !active()) return
    const images = await replaceContentImages(type, id, ids)
    if (!active()) return
    upload.finish(); emit('updated', images); saved.value = true
  } catch (caught) { if (active()) error.value = translateApiError(caught, 'media.saveFailed') }
  finally { if (!disposed && isAuthContextCurrent(context)) saving.value = false }
}
async function remove() {
  if (saving.value || !window.confirm(t('media.confirmRemove'))) return
  saving.value = true; error.value = ''
  const context = captureAuthContext(), type = props.type, id = props.id
  const active = () => !disposed && isAuthContextCurrent(context) && props.type === type && props.id === id
  try {
    const images = await replaceContentImages(type, id, [])
    if (!active()) return
    upload.finish(); emit('updated', images); saved.value = true
  } catch (caught) { if (active()) error.value = translateApiError(caught, 'media.saveFailed') }
  finally { if (!disposed && isAuthContextCurrent(context)) saving.value = false }
}
</script>
<style scoped>
.image-editor { padding: 12px; border: 1px solid var(--color-border); border-radius: 14px; background: var(--color-surface); color: var(--color-text-primary); }
summary { min-height: 44px; display: flex; align-items: center; font-weight: 700; cursor: pointer; }
input { max-width: 100%; min-height: 44px; color: var(--color-text-primary); }
.preview { width: 100%; max-height: 200px; object-fit: cover; border-radius: 14px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
button { min-height: 44px; padding: 8px 14px; border-radius: 14px; color: var(--color-text-accent); background: var(--color-surface-selected); }
p { margin-top: 8px; font-size: 12px; }
</style>
