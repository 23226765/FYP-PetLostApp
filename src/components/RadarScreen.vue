<template>
  <div class="radar">
    <header class="top">
      <div>
        <p class="greeting">Community Radar</p>
        <h1>
          <AppIcon name="pin" :size="18" />
          Maplewood, {{ radiusKm }} km radius
        </h1>
      </div>
      <div class="header-actions">
        <button class="smart-match" type="button" @click="emit('smart-match')">
          Smart Match
        </button>
        <button
          class="bell"
          type="button"
          aria-label="Notifications, 2 unread"
          @click="emit('notifications')"
        >
          <AppIcon name="bell" :size="21" />
          <span class="dot" />
        </button>
      </div>
    </header>

    <div class="toggle" role="tablist" aria-label="Feed view">
      <button
        role="tab"
        :aria-selected="view === 'list'"
        :class="{ active: view === 'list' }"
        @click="view = 'list'"
      >
        <AppIcon name="list" :size="17" />
        List
      </button>
      <button
        role="tab"
        :aria-selected="view === 'map'"
        :class="{ active: view === 'map' }"
        @click="view = 'map'"
      >
        <AppIcon name="map" :size="17" />
        Map
      </button>
    </div>

    <div class="chips" role="group" aria-label="Filter by species">
      <button
        v-for="chip in chips"
        :key="chip"
        class="chip"
        :class="{ active: species === chip }"
        @click="handleSpecies(chip)"
      >
        {{ chip }}
      </button>
    </div>

    <div class="radius">
      <div class="radius-head">
        <span>Search radius</span>
        <span class="radius-value">{{ radiusKm }} km</span>
      </div>
      <input
        type="range"
        min="1"
        max="20"
        step="1"
        :value="radiusKm"
        aria-label="Search radius in kilometers"
        @change="handleRadius"
      />
      <div class="radius-labels"><span>1 km</span><span>20 km</span></div>
    </div>

    <p class="count">{{ pets.length }} pets missing nearby</p>

    <div v-if="loading" class="state">
      <span class="spinner" />
      Loading nearby pets…
    </div>
    <div v-else-if="error" class="state error">
      <p>{{ error }}</p>
      <button class="retry-btn" @click="emit('retry')">Retry</button>
    </div>
    <div v-else-if="pets.length === 0" class="state">
      No pets reported nearby yet. Be the first to post one!
    </div>
    <template v-else>
      <div v-if="view === 'list'" class="feed">
        <PetCard
          v-for="pet in pets"
          :key="pet.id"
          :pet="pet"
          @open="emit('open', pet)"
          @found="emit('found', pet)"
        />
      </div>
      <MapView
        v-else
        :pets="pets"
        :center="userLocation"
        :radius-km="radiusKm"
        @open="(p) => emit('open', p)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { Pet } from '../data/pets'
import AppIcon from './AppIcon.vue'
import PetCard from './PetCard.vue'
import MapView from './MapView.vue'

defineProps<{
  pets: Pet[]
  loading?: boolean
  error?: string
  radiusKm: number
  species: 'All' | 'Dogs' | 'Cats' | 'Other'
  userLocation: { lat: number; lng: number } | null
}>()

const emit = defineEmits<{
  open: [pet: Pet]
  found: [pet: Pet]
  retry: []
  'smart-match': []
  notifications: []
  'radius-change': [value: number]
  'species-change': [value: 'All' | 'Dogs' | 'Cats' | 'Other']
}>()

const view = ref<'list' | 'map'>('list')
const chips = ['All', 'Dogs', 'Cats', 'Other'] as const

function handleRadius(e: Event) {
  emit('radius-change', Number((e.target as HTMLInputElement).value))
}

function handleSpecies(chip: (typeof chips)[number]) {
  emit('species-change', chip)
}
</script>

<style scoped>
.radar {
  padding: calc(var(--safe-top) + 18px) 18px 120px;
  max-width: 480px;
  margin: 0 auto;
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.greeting {
  font-size: 13px;
  font-weight: 700;
  color: var(--ink-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

h1 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 20px;
  font-weight: 800;
  color: var(--ink);
}

h1 svg {
  color: var(--teal);
}

.bell {
  position: relative;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--shadow-card);
  color: var(--ink);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.smart-match {
  min-height: 40px;
  padding: 0 13px;
  border-radius: 999px;
  background: var(--teal);
  color: #fff;
  font-size: 12.5px;
  font-weight: 800;
  box-shadow: var(--shadow-card);
}

.bell .dot {
  position: absolute;
  top: 11px;
  right: 12px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--coral);
  border: 1.5px solid var(--surface);
}

.toggle {
  display: flex;
  background: var(--line);
  border-radius: 999px;
  padding: 4px;
  margin-bottom: 14px;
}

.toggle button {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 10px 0;
  border-radius: 999px;
  font-size: 14.5px;
  font-weight: 800;
  color: var(--ink-muted);
  transition: all 0.2s ease;
}

.toggle button.active {
  background: var(--surface);
  color: var(--teal);
  box-shadow: var(--shadow-card);
}

.chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  margin-bottom: 14px;
}

.chips::-webkit-scrollbar {
  display: none;
}

.chip {
  padding: 7px 16px;
  border-radius: 999px;
  background: var(--surface);
  border: 1.5px solid var(--line);
  font-size: 13.5px;
  font-weight: 700;
  color: var(--ink-muted);
  white-space: nowrap;
  transition: all 0.15s ease;
}

.chip.active {
  background: var(--teal);
  border-color: var(--teal);
  color: #fff;
}

.count {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--ink-muted);
  margin-bottom: 12px;
}

.radius {
  background: var(--surface);
  border: 1.5px solid var(--line);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  margin-bottom: 14px;
}

.radius-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13.5px;
  font-weight: 800;
  color: var(--ink);
}

.radius-value {
  color: var(--teal);
  font-weight: 800;
}

.radius input[type='range'] {
  width: 100%;
  accent-color: var(--teal);
}

.radius-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-muted);
  margin-top: 2px;
}

.feed {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.state {
  padding: 40px 16px;
  text-align: center;
  color: var(--ink-muted);
  font-weight: 700;
  font-size: 14.5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.state.error {
  color: var(--coral);
}

.spinner {
  width: 26px;
  height: 26px;
  border: 3px solid var(--teal-soft);
  border-top-color: var(--teal);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.retry-btn {
  padding: 10px 22px;
  border-radius: 999px;
  background: var(--teal);
  color: #fff;
  font-weight: 800;
  font-size: 14px;
}
</style>
