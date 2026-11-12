<template>
  <article
    class="profile-photo-card"
    role="link"
    tabindex="0"
    :aria-label="accessibleLabel"
    @click="open"
    @keydown.enter="open"
    @keydown.space="open"
  >
    <div class="profile-photo">
      <ManagedImage v-if="source" :src="source" :alt="photoAlt" @error="markFailed" />
      <span v-else class="photo-placeholder" role="img" :aria-label="t('profile.noPhoto')">
        <AppIcon name="paw" :size="30" />
        <small>{{ t('profile.noPhoto') }}</small>
      </span>
    </div>
    <div class="profile-photo-caption">
      <strong>{{ title }}</strong>
      <p v-if="subtitle">{{ subtitle }}</p>
      <span class="status-badge" :class="statusClass">{{ status }}</span>
      <slot />
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from '../AppIcon.vue'
import ManagedImage from '../ManagedImage.vue'
import { useAppI18n } from '../../i18n'
import { attachedPhotoSources } from '../../utils/imagePresentation'

const props = defineProps<{
  title: string
  subtitle?: string
  status: string
  statusClass: string
  accessibleLabel: string
  photoAlt: string
  photo?: string
  photos?: string[]
}>()
const emit = defineEmits<{ open: [] }>()
const { t } = useAppI18n()
const sources = computed(() => attachedPhotoSources(props.photo, props.photos))
const failed = ref(new Set<string>())
const source = computed(() => sources.value.find(value => !failed.value.has(value)))
watch(sources, () => { failed.value = new Set() })
function markFailed() {
  if (source.value) failed.value = new Set([...failed.value, source.value])
}
function open(event: MouseEvent | KeyboardEvent) {
  const target = event.target
  if (target instanceof Element && target.closest('button, a, input, select, textarea')) return
  if (event instanceof KeyboardEvent) event.preventDefault()
  emit('open')
}
</script>

<style scoped>
.profile-photo-card { min-width: 0; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); cursor: pointer; transition: background-color .15s ease; }
.profile-photo-card:hover { background: var(--color-surface-subtle); }
.profile-photo-card:active { background: var(--color-surface-selected); }
.profile-photo-card:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 2px; }
.profile-photo { position: relative; aspect-ratio: 1; overflow: hidden; background: var(--color-surface-subtle); }
.profile-photo img { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover; }
.photo-placeholder { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 8px; padding: 12px; color: var(--color-icon-primary); text-align: center; }
.photo-placeholder small { color: var(--color-text-secondary); font-size: 12px; overflow-wrap: anywhere; }
.profile-photo-caption { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 5px; padding: 10px; }
.profile-photo-caption strong { color: var(--color-text-primary); font-size: 15px; font-weight: 650; line-height: 1.35; overflow-wrap: anywhere; }
.profile-photo-caption p, .profile-photo-caption :deep(small) { max-width: 100%; color: var(--color-text-secondary); font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
.status-badge { max-width: 100%; padding: 4px 8px; border-radius: 999px; background: var(--status-coral-bg); color: var(--color-text-urgent); font-size: 12px; font-weight: 600; line-height: 1.4; white-space: normal; overflow-wrap: anywhere; }
.status-badge.sighted, .status-badge.rescue_dispatched { background: var(--color-surface-selected); color: var(--color-text-accent); }
.status-badge.reunited, .status-badge.rescued { background: var(--teal); color: var(--color-text-on-accent); }
@media (prefers-reduced-motion: reduce) { .profile-photo-card { transition: none; } }
</style>
