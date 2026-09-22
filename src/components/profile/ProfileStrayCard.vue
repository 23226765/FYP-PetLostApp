<template>
  <article
    class="profile-stray-card"
    role="link"
    tabindex="0"
    :aria-label="t('profile.openRescuePost', { animal: animalLabel })"
    @click="openPost"
    @keydown.enter.prevent="openPost"
    @keydown.space.prevent="openPost"
  >
    <div class="photo-wrap">
      <img
        v-if="stray.photo && !imageFailed"
        :src="imageUrl(stray.photo)"
        :alt="t('strays.reportedAlt', { species: animalLabel })"
        @error="imageFailed = true"
      />
      <span v-else class="photo-placeholder"><AppIcon name="paw" :size="32" /></span>
    </div>
    <div class="card-copy">
      <div class="card-title">
        <strong>{{ animalLabel }}</strong>
        <span class="status" :class="stray.rescueStatus">{{ rescueStatusLabel(stray.rescueStatus) }}</span>
      </div>
      <p><AppIcon name="pin" :size="14" />{{ stray.location }}, {{ districtLabel(stray.district) }}</p>
      <small>{{ formatRelativeDate(stray.createdAt) }} · {{ t('strays.commentsCount', { count: stray.commentCount }) }}</small>
      <button
        v-if="removable"
        type="button"
        class="unsave"
        :disabled="removing"
        @click.stop="emit('unsave', stray.id)"
      >
        <AppIcon name="bookmark" :size="16" />{{ removing ? t('profile.unsaving') : t('profile.unsave') }}
      </button>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../AppIcon.vue'
import type { StrayReport } from '../../types/stray'
import { useAppI18n } from '../../i18n'
import { districtLabel, formatRelativeDate, rescueStatusLabel, strayAnimalLabel } from '../../i18n/formatters'

const props = withDefaults(defineProps<{ stray: StrayReport; removable?: boolean; removing?: boolean }>(), {
  removable: false,
  removing: false,
})
const emit = defineEmits<{ open: [id: string]; unsave: [id: string] }>()
const { t } = useAppI18n()
const imageFailed = ref(false)
const animalLabel = computed(() => strayAnimalLabel(props.stray.species, props.stray.animalType))

function imageUrl(value: string) {
  try {
    const api = new URL(import.meta.env.VITE_API_BASE_URL || '/api', window.location.origin)
    return new URL(value, `${api.origin}/`).href
  } catch { return '' }
}

function openPost(event: MouseEvent | KeyboardEvent) {
  const target = event.target
  if (target instanceof Element && target.closest('button, a, input, select, textarea')) return
  emit('open', props.stray.id)
}
</script>

<style scoped>
.profile-stray-card { display: grid; grid-template-columns: 112px minmax(0, 1fr); overflow: hidden; border: 1px solid var(--color-border); border-radius: 16px; background: var(--color-surface); box-shadow: var(--shadow-card); cursor: pointer; transition: transform .2s ease, box-shadow .2s ease; }
.profile-stray-card:hover { transform: translateY(-1px); box-shadow: var(--shadow-float); }
.profile-stray-card:active { transform: scale(.985); }
.profile-stray-card:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 3px; }
.photo-wrap { position: relative; min-height: 128px; overflow: hidden; background: var(--color-surface-selected); }
.photo-wrap img { width: 100%; height: 100%; object-fit: cover; }
.photo-placeholder { position: absolute; inset: 0; display: grid; place-items: center; color: var(--color-icon-primary); }
.card-copy { min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 7px; padding: 12px; }
.card-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.card-title strong { min-width: 0; overflow: hidden; color: var(--color-text-primary); font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
.status { flex: none; padding: 4px 7px; border-radius: 999px; background: var(--status-coral-bg); color: var(--color-text-urgent); font-size: 9.5px; font-weight: 850; }
.status.rescue_dispatched { background: var(--color-surface-selected); color: var(--color-text-accent); }
.status.rescued { background: var(--teal); color: var(--color-text-on-accent); }
p { display: flex; align-items: center; gap: 4px; overflow: hidden; color: var(--color-text-secondary); font-size: 11.5px; text-overflow: ellipsis; white-space: nowrap; }
small { color: var(--color-text-muted); font-size: 10.5px; }
.unsave { align-self: flex-start; min-height: 36px; display: inline-flex; align-items: center; gap: 5px; margin-top: 2px; padding: 0 10px; border: 1px solid var(--color-border); border-radius: 999px; color: var(--color-text-accent); font-size: 11px; font-weight: 800; }
.unsave:disabled { color: var(--color-disabled-text); cursor: wait; }
@media (prefers-reduced-motion: reduce) { .profile-stray-card { transition: none; } }
</style>
