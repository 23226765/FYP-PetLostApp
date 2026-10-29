<template>
  <article class="card" :class="{ 'feed-card': feed }" :tabindex="feed ? 0 : undefined" :role="feed ? 'link' : undefined" :aria-label="feed ? t('feedDesign.openPet', { name: pet.name }) : undefined" @click="emit('open')" @keydown.enter.self="feed && emit('open')">
    <template v-if="!feed">
    <div class="photo-wrap">
      <ManagedImage
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
      <span v-if="isValidDistance(pet.distanceKm)" class="distance">
        <AppIcon name="pin" :size="14" />
        {{ pet.locationPrecision === 'approximate' ? t('feedDesign.approxDistance', { distance: t('common.kilometres', { count: pet.distanceKm }) }) : t('common.kilometres', { count: pet.distanceKm }) }}
      </span>
    </div>
    </template>
    <template v-else>
      <header class="feed-card-header">
        <div><h3>{{ pet.name }}</h3><p><template v-if="pet.breed">{{ pet.breed }} · </template>{{ speciesLabel(pet.species) }} · {{ pet.createdAt ? formatRelativeDate(pet.createdAt) : pet.postedAgo }}</p></div>
        <span class="feed-status" :class="pet.status">{{ petStatusLabel(pet.status) }}</span>
      </header>
      <div class="photo-wrap feed-photo">
        <ManagedImage v-if="photoUrl && !imageFailed" :src="photoUrl" :alt="t('pets.photoAlt', { name: pet.name })" loading="lazy" referrerpolicy="no-referrer" @error="handleImageError" />
        <div v-else class="photo-placeholder" :aria-label="t('pets.missingPhotoAlt', { name: pet.name, type: pet.breed || speciesLabel(pet.species) })" role="img"><AppIcon name="paw" :size="42" /></div>
      </div>
      <div class="feed-card-copy">
        <p class="feed-location"><AppIcon name="pin" :size="16" />{{ pet.district ? districtLabel(pet.district) : t('feedDesign.districtUnknown') }}<span v-if="isValidDistance(pet.distanceKm)"> · {{ pet.locationPrecision === 'approximate' ? t('feedDesign.approxDistance', { distance: t('common.kilometres', { count: pet.distanceKm }) }) : t('common.kilometres', { count: pet.distanceKm }) }}</span></p>
        <p class="feed-last-seen">{{ t('pets.lastSeen', { time: pet.lastSeenAt ? formatRelativeDate(pet.lastSeenAt) : pet.lastSeen }) }}</p>
        <p v-if="pet.reward" class="feed-reward">{{ t('pets.reward', { amount: pet.reward }) }}</p>
        <div class="feed-card-actions">
          <button class="found-btn" type="button" :aria-label="t('feedDesign.sightingFor', { name: pet.name })" @click.stop="emit('found')"><AppIcon name="eye" :size="19" />{{ t('feedDesign.sighting') }}</button>
          <button class="feed-save" :class="{ saved: isSaved(pet.id) }" type="button" :aria-label="isSaved(pet.id) ? t('pets.removeSaved', { name: pet.name }) : t('pets.savePost', { name: pet.name })" :aria-pressed="isSaved(pet.id)" @click.stop="toggleSave(pet.id)"><AppIcon name="bookmark" :size="20" />{{ isSaved(pet.id) ? t('feedDesign.saved') : t('feedDesign.save') }}</button>
        </div>
      </div>
    </template>
    <div v-if="!feed" class="body">
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
import { isValidDistance } from '../utils/distance'
import ManagedImage from "./ManagedImage.vue"
import { computed, ref, watch } from 'vue'
import type { Pet } from '../types/pet'
import { useSavedPets } from '../composables/useSavedPets'
import AppIcon from './AppIcon.vue'
import { useAppI18n } from '../i18n'
import { districtLabel, formatRelativeDate, petStatusLabel, speciesLabel } from '../i18n/formatters'

const props = withDefaults(defineProps<{ pet: Pet; feed?: boolean }>(), { feed: false })
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
.card.feed-card { border: 0; border-bottom: 1px solid var(--color-border); border-radius: 0; box-shadow: none; cursor: pointer; }
.feed-card-header { padding: 12px var(--feed-space); display: flex; align-items: flex-start; gap: 12px; }
.feed-card-header > div { min-width: 0; flex: 1; }
.feed-card-header h3 { font-size: 18px; font-weight: 650; line-height: 1.3; overflow-wrap: anywhere; }
.feed-card-header p { margin-top: 4px; color: var(--color-text-secondary); font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
.feed-status { flex-shrink: 0; max-width: 45%; padding: 5px 9px; border-radius: 999px; background: var(--status-teal-bg); color: var(--color-text-accent); font-size: 13px; font-weight: 600; text-align: center; }
.feed-status.lost { background: var(--status-coral-bg); color: var(--color-text-urgent); }
.feed-card .feed-photo { aspect-ratio: auto; }
.feed-card .feed-photo img { display: block; width: 100%; height: auto; max-height: var(--feed-media-max-height); object-fit: contain; }
.feed-card .feed-photo .photo-placeholder { position: relative; min-height: 128px; background: var(--color-surface-subtle); }
.feed-card-copy { padding: var(--feed-space); }
.feed-location { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font-size: 13px; color: var(--color-text-secondary); }
.feed-last-seen { margin-top: 6px; font-size: 14px; line-height: 1.5; }
.feed-reward { margin-top: 6px; color: var(--color-text-accent); font-size: 14px; font-weight: 600; }
.feed-card-actions { display: flex; align-items: stretch; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.feed-card .found-btn { flex: 1 1 180px; min-width: 0; min-height: 44px; justify-content: center; border-radius: var(--radius-sm); padding: 10px 14px; background: var(--button-primary); color: var(--button-primary-text); font-size: 14px; font-weight: 600; line-height: 1.4; text-align: center; white-space: normal; overflow-wrap: anywhere; }
.feed-card .found-btn svg { flex-shrink: 0; }
.feed-card .found-btn:active { background: color-mix(in srgb, var(--button-primary) 88%, black); }
.feed-save { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 0 10px 8px; border-radius: 0; border: 0; color: var(--color-text-secondary); font-size: 14px; font-weight: 600; }
.feed-save.saved { background: transparent; color: var(--color-text-accent); font-weight: 700; }
.feed-save.saved svg { fill: currentColor; }
.feed-card:focus-visible { outline: 3px solid var(--color-focus); outline-offset: -3px; }
.card.feed-card:active { transform: none; }
.feed-card button { transition: transform .15s ease, background-color .15s ease; }
.feed-card button:active { transform: scale(.98); }
@media (prefers-reduced-motion: reduce) { .feed-card, .feed-card button { transition: none; } }
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
