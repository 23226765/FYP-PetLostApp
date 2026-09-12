<template>
  <div class="detail">
    <div class="hero">
      <img :src="pet.photo" :alt="`Photo of ${pet.name}, a missing ${pet.breed}`" />
      <button class="back" aria-label="Go back" @click="emit('close')">
        <AppIcon name="back" :size="20" />
      </button>
      <button class="share" aria-label="Share this pet's poster" @click="emit('poster')">
        <AppIcon name="share" :size="19" />
      </button>
      <span class="badge" :class="pet.status">
        {{ pet.status === 'lost' ? 'LOST' : 'SIGHTED NEARBY' }}
      </span>
    </div>

    <div class="sheet">
      <div class="grab" />
      <div class="title-row">
        <div>
          <h2>{{ pet.name }}</h2>
          <p class="sub">{{ pet.breed }} · {{ pet.species }}</p>
        </div>
        <span class="distance">
          <AppIcon name="pin" :size="15" />
          {{ pet.distanceKm }} km away
        </span>
      </div>

      <div class="facts">
        <div class="fact">
          <span class="label">Last seen</span>
          <span class="value">{{ pet.lastSeen }}</span>
        </div>
        <div class="fact">
          <span class="label">Location</span>
          <span class="value">{{ pet.location }}</span>
        </div>
        <div v-if="pet.reward" class="fact">
          <span class="label">Reward</span>
          <span class="value reward">{{ pet.reward }}</span>
        </div>
      </div>

      <section class="sighting-history" aria-labelledby="sighting-history-title">
        <h3 id="sighting-history-title">Sighting history</h3>
        <p v-if="sightingsLoading" class="timeline-state" role="status">
          Loading sightings...
        </p>
        <p v-else-if="sightingsError" class="timeline-state error" role="alert">
          {{ sightingsError }}
        </p>
        <p v-else-if="sightings.length === 0" class="timeline-state">No sightings yet.</p>
        <ol v-else class="timeline">
          <li v-for="sighting in sightings" :key="sighting.id" class="timeline-item">
            <span class="timeline-dot" aria-hidden="true" />
            <div class="timeline-content">
              <div class="timeline-head">
                <strong>{{ sighting.locationName || 'Location not provided' }}</strong>
                <time v-if="sighting.createdAt" :datetime="String(sighting.createdAt)">
                  {{ relativeTime(sighting.createdAt) }}
                </time>
              </div>
              <p v-if="sighting.note">{{ sighting.note }}</p>
              <img
                v-if="sighting.photo"
                class="sighting-thumbnail"
                :src="sighting.photo"
                :alt="`Sighting of ${pet.name}`"
                loading="lazy"
              />
            </div>
          </li>
        </ol>
      </section>

      <h3>About {{ pet.name }}</h3>
      <p class="desc">{{ pet.description }}</p>

      <div class="owner">
        <button
          class="owner-info"
          type="button"
          :aria-label="`Message ${pet.owner}`"
          @click="emit('chat')"
        >
          <span class="owner-name">{{ pet.owner }}</span>
          <span class="owner-role">Owner · posted {{ pet.postedAgo }}</span>
        </button>
        <a class="call" :href="`tel:${pet.ownerPhone}`" :aria-label="`Call ${pet.owner}`">
          <AppIcon name="phone" :size="19" />
        </a>
      </div>

      <button class="found-cta" @click="emit('found')">
        <AppIcon name="eye" :size="20" />
        Found it? Report a sighting
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { Pet, Sighting } from '../types/pet'
import { getPetSightings } from '../services/api'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ pet: Pet }>()
const emit = defineEmits<{ close: []; found: []; poster: []; chat: [] }>()

const sightings = ref<Sighting[]>([])
const sightingsLoading = ref(true)
const sightingsError = ref('')

async function loadSightings() {
  sightingsLoading.value = true
  sightingsError.value = ''
  try {
    sightings.value = await getPetSightings(props.pet.id)
  } catch (error) {
    sightings.value = []
    sightingsError.value = error instanceof Error ? error.message : 'Failed to load sightings.'
  } finally {
    sightingsLoading.value = false
  }
}

function relativeTime(value: string | Date) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime())
  const minutes = Math.floor(elapsed / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

onMounted(loadSightings)
</script>

<style scoped>
.detail {
  position: fixed;
  inset: 0;
  z-index: 45;
  background: var(--bg);
  overflow-y: auto;
}

.hero {
  position: relative;
  aspect-ratio: 1 / 1;
  max-height: 55vh;
  width: 100%;
}

.hero img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.back,
.share {
  position: absolute;
  top: calc(var(--safe-top) + 14px);
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  color: var(--ink);
  box-shadow: var(--shadow-card);
}

.back {
  left: 16px;
}

.share {
  right: 16px;
}

.badge {
  position: absolute;
  bottom: 40px;
  left: 18px;
  padding: 5px 14px;
  border-radius: 999px;
  font-size: 12.5px;
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

.sheet {
  position: relative;
  margin-top: -26px;
  background: var(--bg);
  border-radius: 26px 26px 0 0;
  padding: 10px 20px calc(var(--safe-bottom) + 28px);
  max-width: 480px;
  margin-left: auto;
  margin-right: auto;
}

.grab {
  width: 42px;
  height: 5px;
  border-radius: 999px;
  background: var(--line);
  margin: 0 auto 16px;
}

.title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18px;
}

h2 {
  font-size: 26px;
  font-weight: 800;
}

.sub {
  color: var(--ink-muted);
  font-size: 14.5px;
  font-weight: 600;
}

.distance {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 13px;
  border-radius: 999px;
  background: var(--teal-soft);
  color: var(--teal);
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
}

.facts {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: var(--line);
  border-radius: var(--radius-md);
  overflow: hidden;
  margin-bottom: 20px;
}

.fact {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 13px 16px;
  background: var(--surface);
}

.label {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--ink-muted);
}

.value {
  font-size: 14px;
  font-weight: 700;
  text-align: right;
}

.value.reward {
  color: var(--coral);
}

.sighting-history {
  margin-bottom: 20px;
}

.timeline-state {
  padding: 16px;
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--ink-muted);
  font-size: 13.5px;
  font-weight: 700;
  text-align: center;
}

.timeline-state.error {
  color: var(--coral);
}

.timeline {
  list-style: none;
  display: flex;
  flex-direction: column;
  margin-top: 10px;
}

.timeline-item {
  position: relative;
  display: grid;
  grid-template-columns: 18px 1fr;
  gap: 10px;
  padding-bottom: 14px;
}

.timeline-item:not(:last-child)::before {
  content: '';
  position: absolute;
  top: 16px;
  bottom: 0;
  left: 7px;
  width: 2px;
  background: var(--line);
}

.timeline-dot {
  width: 16px;
  height: 16px;
  margin-top: 14px;
  border: 4px solid var(--teal-soft);
  border-radius: 50%;
  background: var(--teal);
  z-index: 1;
}

.timeline-content {
  min-width: 0;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow-card);
}

.timeline-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.timeline-head strong {
  font-size: 14px;
}

.timeline-head time {
  flex-shrink: 0;
  color: var(--ink-muted);
  font-size: 11.5px;
  font-weight: 700;
}

.timeline-content p {
  margin-top: 5px;
  color: var(--ink-muted);
  font-size: 13px;
  line-height: 1.45;
}

.sighting-thumbnail {
  width: 72px;
  height: 72px;
  margin-top: 10px;
  border-radius: var(--radius-sm);
  object-fit: cover;
}

h3 {
  font-size: 16px;
  font-weight: 800;
  margin-bottom: 6px;
}

.desc {
  font-size: 14.5px;
  color: var(--ink-muted);
  line-height: 1.6;
  margin-bottom: 20px;
}

.owner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  box-shadow: var(--shadow-card);
  margin-bottom: 20px;
}

.owner-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.owner-name {
  font-weight: 800;
  font-size: 15px;
}

.owner-role {
  font-size: 13px;
  color: var(--ink-muted);
  font-weight: 600;
}

.call {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--teal);
  color: #fff;
}

.found-cta {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 17px 0;
  border-radius: var(--radius-md);
  background: var(--teal);
  color: #fff;
  font-size: 16px;
  font-weight: 800;
  box-shadow: var(--shadow-float);
  transition: transform 0.15s ease;
}

.found-cta:active {
  transform: scale(0.98);
}
</style>
