<script setup lang="ts">
import { ref } from 'vue'
import { useAppI18n } from '../i18n'
import type { usePostPhotos } from '../composables/usePostPhotos'
import ManagedImage from './ManagedImage.vue'
import AppIcon from './AppIcon.vue'
const props = defineProps<{ draft: ReturnType<typeof usePostPhotos>; disabled?: boolean }>()
const { t } = useAppI18n()
const input = ref<HTMLInputElement | null>(null)
const failed = ref(new Set<number>())
function choose(event: Event) {
  const field = event.target as HTMLInputElement
  if (!props.disabled && field.files) props.draft.addFiles(Array.from(field.files))
  field.value = ''
}
</script>
<template>
  <section class="picker" :aria-label="t('pets.addPhotos')">
    <strong aria-live="polite">{{ t(draft.items.value.length > 4 ? 'postPhotos.older' : 'postPhotos.counter', { count: draft.items.value.length }) }}</strong>
    <input ref="input" type="file" multiple hidden accept="image/jpeg,image/png,image/webp" @change="choose" />
    <div class="grid">
      <div v-for="(item, i) in draft.items.value" :key="item.key" class="tile">
        <div class="thumb">
          <ManagedImage v-if="item.preview && !failed.has(item.key)" :src="item.preview" :alt="t('pets.selectedPhotoAlt')" @error="failed.add(item.key)" />
          <AppIcon v-else name="paw" />
          <small v-if="i === 0">{{ t('postPhotos.cover') }}</small>
        </div>
        <div class="tools">
          <button type="button" :disabled="disabled || i === 0" :aria-label="t('postPhotos.earlier',{n:i+1})" @click="draft.move(i,-1)">←</button>
          <button type="button" :disabled="disabled || i === draft.items.value.length-1" :aria-label="t('postPhotos.later',{n:i+1})" @click="draft.move(i,1)">→</button>
          <button type="button" :disabled="disabled" :aria-label="t('postPhotos.remove',{n:i+1})" @click="draft.remove(i)">×</button>
        </div>
      </div>
      <button class="add" type="button" :disabled="disabled || draft.items.value.length >= 4" @click="input?.click()">＋ {{ t('pets.addPhotos') }}</button>
    </div>
    <div v-if="draft.busy.value || draft.error.value || draft.items.value.some(i => i.upload?.error)" class="upload-status" aria-live="polite">
      <template v-if="draft.busy.value">
        {{ t('media.uploading',{percent:draft.progress.value}) }}
        <button type="button" @click="draft.cancel()">{{ t('common.cancel') }}</button>
      </template>
      <p v-else role="alert">{{ draft.error.value || draft.items.value.find(i => i.upload?.error)?.upload?.error }}</p>
    </div>
  </section>
</template>
<style scoped>
.picker { min-width:0; display:grid; gap:8px; color:var(--color-text-primary); overflow-wrap:anywhere; }
.grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.tile,.add { min-width:0; border:1px solid var(--color-border); border-radius:12px; overflow:hidden; }
.thumb { aspect-ratio:4/3; position:relative; display:grid; place-items:center; background:var(--color-surface-subtle); }
.thumb img { width:100%; height:100%; object-fit:cover; }
.thumb small { position:absolute; bottom:4px; left:4px; border-radius:6px; background:var(--color-surface); padding:2px 6px; }
.tools { display:flex; flex-wrap:wrap; }
button { min-height:44px; color:var(--color-text-accent); background:var(--color-surface); }
.tools button { flex:1 1 44px; }
.add { min-height:84px; border-style:dashed; background:var(--color-surface-subtle); font-weight:700; }
button:disabled { opacity:.5; }
</style>

