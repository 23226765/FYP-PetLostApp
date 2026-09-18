<template>
  <div class="radar">
    <header class="top">
      <div>
        <p class="greeting">Community Radar</p>
        <h1>
          <AppIcon name="pin" :size="18" />
          {{ district || 'Hong Kong' }}, {{ radiusKm }} km radius
        </h1>
      </div>
      <div class="header-actions">
        <button class="smart-match" type="button" @click="emit('smart-match')">
          Photo Compare
        </button>
        <button
          class="bell"
          type="button"
          :aria-label="`Notifications, ${unreadCount} unread`"
          @click="emit('notifications')"
        >
          <AppIcon name="bell" :size="21" />
          <span v-if="unreadCount" class="dot">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
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

    <div class="detail-filters" aria-label="Filter by breed and district">
      <label>
        <span>Breed</span>
        <input
          type="search"
          :value="breed"
          placeholder="Any breed"
          @input="handleBreed"
        />
      </label>
      <label>
        <span>District</span>
        <select :value="district" @change="handleDistrict">
          <option value="">All districts</option>
          <option v-for="item in HK_DISTRICTS" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
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

    <div v-if="view === 'map'" class="map-layer-control" aria-label="Map display layer">
      <div>
        <strong>Map layer</strong>
        <span>{{ mapLayer === 'heatmap' ? 'Recent community activity' : 'Individual reports' }}</span>
      </div>
      <div class="layer-buttons" role="group" aria-label="Choose map layer">
        <button
          type="button"
          :class="{ active: mapLayer === 'pins' }"
          :aria-pressed="mapLayer === 'pins'"
          @click="mapLayer = 'pins'"
        >
          Pins
        </button>
        <button
          type="button"
          :class="{ active: mapLayer === 'heatmap' }"
          :aria-pressed="mapLayer === 'heatmap'"
          @click="mapLayer = 'heatmap'"
        >
          Hotspots
        </button>
      </div>
    </div>

    <div v-if="loading" class="state">
      <span class="spinner" />
      Loading nearby pets…
    </div>
    <div v-else-if="error" class="state error">
      <p>{{ error }}</p>
      <button class="retry-btn" @click="emit('retry')">Retry</button>
    </div>
    <div v-else-if="view === 'list' && pets.length === 0" class="state">
      No pets reported nearby yet. Be the first to post one!
    </div>
    <template v-else-if="view === 'list'">
      <div class="feed">
        <PetCard
          v-for="pet in pets"
          :key="pet.id"
          :pet="pet"
          @open="emit('open', pet)"
          @found="emit('found', pet)"
        />
      </div>
    </template>
    <div v-else class="map-section">
      <div v-if="mapLayer === 'heatmap'" class="analytics-card" aria-live="polite">
        <template v-if="hotspotLoading">
          <span class="analytics-spinner" aria-hidden="true" />
          <span>Calculating recent hotspots…</span>
        </template>
        <template v-else-if="hotspotError">
          <span>{{ hotspotError }}</span>
          <button type="button" @click="loadHotspots">Retry</button>
        </template>
        <template v-else-if="hotspotSummary && hotspotSummary.total > 0">
          <div>
            <strong>{{ hotspotSummary.total }} recent reports</strong>
            <span>
              {{ hotspotSummary.sightings }} sightings · {{ hotspotSummary.strays }} stray reports
            </span>
          </div>
          <span class="analytics-window">{{ hotspotSummary.windowDays }} days</span>
        </template>
        <span v-else>No hotspot activity found within this area.</span>
      </div>
      <MapView
        :pets="pets"
        :center="userLocation"
        :radius-km="radiusKm"
        :heat-points="hotspotPoints"
        :show-heatmap="mapLayer === 'heatmap' && !hotspotLoading && !hotspotError"
        @open="(p) => emit('open', p)"
      />
      <div v-if="mapLayer === 'heatmap'" class="heat-legend" aria-label="Hotspot intensity legend">
        <span>Lower activity</span>
        <span class="legend-gradient" aria-hidden="true" />
        <span>Higher urgency</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { Pet } from '../types/pet'
import type { HotspotPoint, HotspotSummary } from '../types/analytics'
import { HK_DISTRICTS } from '../types/pet'
import { getHotspots } from '../services/api'
import AppIcon from './AppIcon.vue'
import PetCard from './PetCard.vue'
import MapView from './MapView.vue'

const props = defineProps<{
  pets: Pet[]
  loading?: boolean
  error?: string
  radiusKm: number
  species: 'All' | 'Dogs' | 'Cats' | 'Other'
  breed: string
  district: string
  unreadCount: number
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
  'breed-change': [value: string]
  'district-change': [value: string]
}>()

const view = ref<'list' | 'map'>('list')
const mapLayer = ref<'pins' | 'heatmap'>('pins')
const hotspotPoints = ref<HotspotPoint[]>([])
const hotspotSummary = ref<HotspotSummary | null>(null)
const hotspotLoading = ref(false)
const hotspotError = ref('')
const chips = ['All', 'Dogs', 'Cats', 'Other'] as const
const HK_CENTER = { lat: 22.3193, lng: 114.1694 }
let hotspotRequestSequence = 0
let hotspotAbortController: AbortController | null = null

async function loadHotspots() {
  if (view.value !== 'map' || mapLayer.value !== 'heatmap') {
    hotspotRequestSequence += 1
    hotspotAbortController?.abort()
    hotspotAbortController = null
    hotspotLoading.value = false
    return
  }

  const sequence = ++hotspotRequestSequence
  hotspotAbortController?.abort()
  const controller = new AbortController()
  hotspotAbortController = controller
  hotspotLoading.value = true
  hotspotError.value = ''
  const center = props.userLocation || HK_CENTER

  try {
    const result = await getHotspots(
      {
        lat: center.lat,
        lng: center.lng,
        radiusKm: props.radiusKm,
        days: 30,
        source: 'all',
      },
      controller.signal,
    )
    if (sequence !== hotspotRequestSequence) return
    hotspotPoints.value = result.points
    hotspotSummary.value = result.summary
  } catch (error) {
    if (sequence !== hotspotRequestSequence) return
    hotspotPoints.value = []
    hotspotSummary.value = null
    hotspotError.value =
      error instanceof Error ? error.message : 'Unable to load hotspot analytics.'
  } finally {
    if (sequence === hotspotRequestSequence) {
      hotspotLoading.value = false
      if (hotspotAbortController === controller) hotspotAbortController = null
    }
  }
}

watch(
  [
    view,
    mapLayer,
    () => props.radiusKm,
    () => props.userLocation?.lat,
    () => props.userLocation?.lng,
  ],
  () => void loadHotspots(),
)

onBeforeUnmount(() => {
  hotspotRequestSequence += 1
  hotspotAbortController?.abort()
  hotspotAbortController = null
})

function handleRadius(e: Event) {
  emit('radius-change', Number((e.target as HTMLInputElement).value))
}

function handleSpecies(chip: (typeof chips)[number]) {
  emit('species-change', chip)
}

function handleBreed(event: Event) {
  emit('breed-change', (event.target as HTMLInputElement).value)
}

function handleDistrict(event: Event) {
  emit('district-change', (event.target as HTMLSelectElement).value)
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
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 50%;
  background: var(--coral);
  border: 1.5px solid var(--surface);
  color: #fff;
  font-size: 9px;
  font-weight: 800;
  line-height: 14px;
  text-align: center;
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

.detail-filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 14px;
}

.detail-filters label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.detail-filters span {
  font-size: 12px;
  font-weight: 800;
  color: var(--ink-muted);
}

.detail-filters input,
.detail-filters select {
  width: 100%;
  min-height: 44px;
  padding: 0 11px;
  border: 1.5px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
  outline: none;
}

.detail-filters input:focus,
.detail-filters select:focus {
  border-color: var(--teal);
}

.count {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--ink-muted);
  margin-bottom: 12px;
}

.map-layer-control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 11px 10px 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: var(--shadow-card);
}

.map-layer-control > div:first-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.map-layer-control strong {
  color: var(--ink);
  font-size: 13px;
  font-weight: 800;
}

.map-layer-control span {
  color: var(--ink-muted);
  font-size: 10.5px;
  font-weight: 650;
}

.layer-buttons {
  display: flex;
  flex-shrink: 0;
  gap: 3px;
  padding: 3px;
  border-radius: 999px;
  background: var(--line);
}

.layer-buttons button {
  min-height: 36px;
  padding: 0 11px;
  border-radius: 999px;
  color: var(--ink-muted);
  font-size: 11.5px;
  font-weight: 800;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.layer-buttons button.active {
  background: #1d6360;
  color: #fff;
  box-shadow: 0 3px 10px rgba(29, 99, 96, 0.22);
}

.layer-buttons button:active {
  transform: scale(0.98);
}

.map-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.analytics-card {
  min-height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 14px;
  border: 1px solid rgba(29, 99, 96, 0.15);
  border-radius: 14px;
  background: rgba(29, 99, 96, 0.08);
  color: #1d6360;
  font-size: 12px;
  font-weight: 700;
}

.analytics-card > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.analytics-card strong {
  font-size: 13px;
  font-weight: 850;
}

.analytics-card button {
  min-height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  background: #1d6360;
  color: #fff;
  font-size: 11.5px;
  font-weight: 800;
}

.analytics-window {
  flex-shrink: 0;
  padding: 4px 9px;
  border-radius: 999px;
  background: #fcf9f2;
  color: #1d6360 !important;
  font-size: 10.5px !important;
  font-weight: 800 !important;
}

.analytics-spinner {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border: 2px solid rgba(29, 99, 96, 0.2);
  border-top-color: #1d6360;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.heat-legend {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 0 4px;
  color: var(--ink-muted);
  font-size: 10.5px;
  font-weight: 700;
}

.legend-gradient {
  height: 7px;
  border-radius: 999px;
  background: linear-gradient(90deg, #79b7ae, #1d6360 45%, #f2a65a 72%, #ef6351);
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
