<template>
  <div v-if="upload.uploading || upload.error" class="upload-status" aria-live="polite">
    <template v-if="upload.uploading">
      <label>{{ t('media.uploading', { percent: upload.progress }) }}</label>
      <progress :value="upload.progress" max="100" :aria-label="t('media.progress')" />
      <button type="button" @click="upload.cancel()">{{ t('common.cancel') }}</button>
    </template>
    <template v-else>
      <p role="alert">{{ upload.error }}</p>
      <button type="button" @click="retry">{{ t('media.retry') }}</button>
    </template>
  </div>
</template>
<script setup lang="ts">
import { useAppI18n } from '../i18n'
import type { useImageUpload } from '../composables/useImageUpload'
const props = defineProps<{ upload: ReturnType<typeof useImageUpload> }>()
const { t } = useAppI18n()
function retry() { void props.upload.ensure().catch(() => undefined) }
</script>
<style scoped>
.upload-status { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; color: var(--color-text-primary); font-size: 12px; }
progress { max-width: 100%; accent-color: #1d6360; }
button { min-height: 44px; padding: 8px 14px; border-radius: 14px; color: var(--color-text-accent); background: var(--color-surface-selected); }
p { color: var(--color-text-urgent); }
</style>
