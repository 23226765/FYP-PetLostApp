<template>
  <article class="card" @click="emit('open')">
    <div class="photo-wrap">
      <img
        v-if="photoUrl && !imageFailed"
        :src="photoUrl"
        alt=""
        aria-hidden="true"
        loading="lazy"
        @error="imageFailed = true"
      />
      <div v-else class="photo-placeholder" aria-hidden="true">
        <AppIcon name="paw" :size="42" />
      </div>
      <span class="sr-only">Photo of {{ pet.name }}, a missing {{ pet.breed }}</span>
      <span class="badge" :class="pet.status">
        {{ pet.status === 'lost' ? 'LOST' : 'SIGHTED' }}
      </span>
      <span class="distance">
        <AppIcon name="pin" :size="14" />
        {{ pet.distanceKm }} km
      </span>
    </div>
    <div class="body">
      <div class="row">
        <h3>{{ pet.name }}</h3>
        <span class="posted">{{ pet.postedAgo }}</span>
      </div>
      <p class="meta">{{ pet.breed }} · Last seen {{ pet.lastSeen }}</p>
      <div class="actions">
        <button class="found-btn" @click.stop="emit('found')">
          <AppIcon name="eye" :size="17" />
          Found it?
        </button>
        <span v-if="pet.reward" class="reward">{{ pet.reward }} reward</span>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Pet } from '../data/pets'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ pet: Pet }>()
const emit = defineEmits<{ open: []; found: [] }>()

const imageFailed = ref(false)
const photoUrl = computed(() => normalizeImageUrl(props.pet.photo))

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
  background: #fcf9f2;
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
    radial-gradient(circle at 50% 42%, rgba(29, 99, 96, 0.12), transparent 34%),
    #fcf9f2;
  color: rgba(29, 99, 96, 0.55);
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
  color: var(--teal);
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
  color: var(--coral);
}
</style>
