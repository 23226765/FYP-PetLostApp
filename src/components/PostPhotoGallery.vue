<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import ManagedImage from './ManagedImage.vue'
import AppIcon from './AppIcon.vue'
import { useAppI18n } from '../i18n'
import { attachedPhotoSources, photoFallbackKey } from '../utils/imagePresentation'
const props = defineProps<{photo?:string; photos?:string[]; alt:string}>()
const { t } = useAppI18n()
const urls = computed(() => attachedPhotoSources(props.photo, props.photos))
const index = ref(0), failed = ref(new Set<string>())
const current = computed(() => urls.value[index.value] || '')
watch(urls, () => { index.value = 0; failed.value = new Set() })
let start: {x:number;y:number} | undefined
function swipe(event:TouchEvent) {
  const end = event.changedTouches[0]
  if (start && end) {
    const dx = end.clientX - start.x
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(end.clientY-start.y)) step(dx < 0 ? 1 : -1)
  }
  start = undefined
}
function step(n:number) { index.value = Math.max(0, Math.min(urls.value.length-1,index.value+n)) }
</script>
<template>
  <div class="gallery" @touchstart.passive="start = $event.touches.length === 1 ? {x:$event.touches[0]!.clientX,y:$event.touches[0]!.clientY} : undefined" @touchend.passive="swipe" @touchcancel="start=undefined">
    <ManagedImage priority v-if="current && !failed.has(current)" :key="urls[index]" :src="current" :alt="alt" @error="failed.add(current)" />
    <div v-else class="hero-placeholder"><AppIcon name="paw" :size="42" /><small>{{ t(photoFallbackKey(photo,photos)) }}</small></div>
    <nav v-if="urls.length > 1" :aria-label="t('postPhotos.gallery')">
      <button type="button" :aria-label="t('postPhotos.prev')" :disabled="index === 0" @click="step(-1)">←</button>
      <span aria-live="polite">{{ index + 1 }} / {{ urls.length }}</span>
      <button type="button" :aria-label="t('postPhotos.next')" :disabled="index === urls.length-1" @click="step(1)">→</button>
    </nav>
  </div>
</template>
<style scoped>
.gallery { width:100%; min-width:0; }
.gallery img { width:100%; height:auto; display:block; object-fit:contain; }
.hero-placeholder { min-height:220px; display:grid; place-content:center; justify-items:center; gap:8px; color:var(--color-text-secondary); }
nav { display:flex; align-items:center; justify-content:center; gap:8px; background:var(--color-surface); color:var(--color-text-primary); }
button { min-width:44px; min-height:44px; color:var(--color-text-accent); }
</style>

