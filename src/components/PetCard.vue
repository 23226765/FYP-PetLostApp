<template>
  <article class="card" @click="emit('open')">
    <div class="photo-wrap">
      <img
        v-if="photoUrl && !imageFailed"
        :src="photoUrl"
        alt=""
        aria-hidden="true"
        loading="lazy"
        referrerpolicy="no-referrer"
        @error="handleImageError"
      />
      <div v-else class="photo-placeholder" aria-hidden="true">
        <AppIcon name="paw" :size="42" />
      </div>
      <span class="sr-only">{{ t('pets.missingPhotoAlt', { name: pet.name, type: pet.breed || speciesLabel(pet.species) }) }}</span>
      <span class="badge" :class="pet.status">
        {{ petStatusLabel(pet.status) }}
      </span>
      <button
        class="save-button"
        :class="{ saved: isSaved(pet.id) }"
        type="button"
        :aria-label="isSaved(pet.id) ? t('pets.removeSaved', { name: pet.name }) : t('pets.savePost', { name: pet.name })"
        :aria-pressed="isSaved(pet.id)"
        @click.stop="toggleSave(pet.id)"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="21"
          height="21"
          viewBox="0 0 24 24"
          :fill="isSaved(pet.id) ? 'currentColor' : 'none'"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" />
        </svg>
      </button>
      <span class="distance">
        <AppIcon name="pin" :size="14" />
        {{ t('common.kilometres', { count: pet.distanceKm }) }}
      </span>
    </div>
    <div class="body">
      <div class="row">
        <h3>{{ pet.name }}</h3>
        <span class="posted">{{ pet.createdAt ? formatRelativeDate(pet.createdAt) : pet.postedAgo }}</span>
      </div>
      <p class="meta"><template v-if="pet.breed">{{ pet.breed }} &middot; </template>{{ t('pets.lastSeen', { time: pet.lastSeenAt ? formatRelativeDate(pet.lastSeenAt) : pet.lastSeen }) }}</p>
      <div class="actions">
        <button class="found-btn" @click.stop="emit('found')">
          <AppIcon name="eye" :size="17" />
          {{ t('pets.foundIt') }}
        </button>
        <span v-if="pet.reward" class="reward">{{ t('pets.reward', { amount: pet.reward }) }}</span>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Pet } from '../types/pet'
import { useSavedPets } from '../composables/useSavedPets'
import AppIcon from './AppIcon.vue'
import { useAppI18n } from '../i18n'
import { formatRelativeDate, petStatusLabel, speciesLabel } from '../i18n/formatters'

const props = defineProps<{ pet: Pet }>()
const emit = defineEmits<{ open: []; found: [] }>()
const { isSaved, toggleSave } = useSavedPets()
const { t } = useAppI18n()

const imageFailed = ref(false)
const petImage = computed(
  () => props.pet.photo || (props.pet.photos && props.pet.photos[0]) || null,
)
const photoUrl = computed(() => normalizeImageUrl(petImage.value))

watch(photoUrl, () => {
  imageFailed.value = false
})

function normalizeImageUrl(value: string | null | undefined): string {
  const photo = value?.trim()
  if (!photo) return ''

  try {
    const appOrigin = window.location.origin
    const apiUrl = new URL(import.meta.env.VITE_API_BASE_URL || '/api', appOrigin)
    const resolved = new URL(photo, `${apiUrl.origin}/`)
    return ['http:', 'https:', 'data:', 'blob:'].includes(resolved.protocol) ? resolved.href : ''
  } catch {
    return ''
  }
}

function handleImageError(event: Event) {
  const image = event.currentTarget as HTMLImageElement | null
  if (image && (image.currentSrc === photoUrl.value || image.src === photoUrl.value)) {
    imageFailed.value = true
  }
}

</script>

<style scoped>
.card {
  background: var(--surface);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-card);
  transition: transform 0.15s ease;
}

.card:active {
  transform: scale(0.98);
}

.photo-wrap {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: var(--color-surface-subtle);
}

.photo-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--color-icon-primary) 12%, transparent), transparent 34%),
    var(--color-surface-subtle);
  color: var(--color-icon-primary);
}

.badge {
  position: absolute;
  top: 14px;
  left: 14px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: #fff;
}

.badge.lost {
  background: var(--coral);
}

.badge.sighted {
  background: var(--teal);
}

.save-button {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(29, 99, 96, 0.08);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.94);
  color: var(--color-icon-on-light);
  box-shadow: 0 5px 16px rgba(29, 99, 96, 0.15);
  backdrop-filter: blur(8px);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.save-button.saved {
  border-color: #1d6360;
  background: #1d6360;
  color: #fff;
}

.save-button:active {
  transform: scale(0.94);
}

.distance {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(61, 56, 53, 0.72);
  color: #fff;
  font-size: 12.5px;
  font-weight: 700;
  backdrop-filter: blur(4px);
}

.body {
  padding: 14px 16px 16px;
}

.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

h3 {
  font-size: 19px;
  font-weight: 800;
}

.posted {
  font-size: 12.5px;
  color: var(--ink-muted);
  font-weight: 600;
}

.meta {
  font-size: 14px;
  color: var(--ink-muted);
  margin-top: 2px;
}

.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}

.found-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 16px;
  border-radius: 999px;
  background: var(--teal-soft);
  color: var(--color-text-accent);
  font-size: 14px;
  font-weight: 800;
  transition: background 0.15s ease;
}

.found-btn:active {
  background: #c2e7e1;
}

.reward {
  font-size: 13.5px;
  font-weight: 800;
  color: var(--color-text-urgent);
}

@media (prefers-reduced-motion: reduce) {
  .save-button {
    transition: none;
  }
}
</style>
